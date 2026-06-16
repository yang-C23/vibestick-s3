// vibestick-s3 firmware for M5Stack StickS3.
// Verified: BtnA = front blue button (record/primary), BtnB = right side (secondary).
// Transport: USB serial by default (school-friendly, no Wi-Fi). Hold BtnB at boot
// for Wi-Fi mode (captive-portal setup) for home use.
#include <ArduinoJson.h>
#include <ESPmDNS.h>
#include <M5Unified.h>
#include <Preferences.h>
#include <WebSocketsClient.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include "mbedtls/base64.h"

static const int PROTOCOL_VERSION = 1;
static const char* FIRMWARE = "0.3.0";
static const uint16_t BRIDGE_PORT = 47600;
static const size_t MIC_CHUNK = 1024; // samples/frame (~64ms @16k)

WebSocketsClient ws;
Preferences prefs;
String bridgeHost, pairCode, deviceId;

bool useSerial = true;        // chosen at boot
bool linked = false;          // true after 'welcome'
bool recording = false;
String deviceState = "idle", agent = "unknown", phase = "", title = "", target = "auto";
String draftId, draftPreview, riskLevel = "low", lastError, rxLine;
bool reqAttn = false;
int targetIdx = 0;
uint32_t lastHeartbeat = 0, lastHello = 0;
bool needRedraw = true;
int16_t micbuf[MIC_CHUNK];

static const char* TARGETS[] = {"auto", "claude", "codex", "clipboard", "terminal"};

static const char* faceFor(const String& a, const String& st) {
  bool cx = (a == "codex");
  if (st == "recording" || st == "streaming") return cx ? "[O.O]" : "(O.O)";
  if (st == "transcribing") return cx ? "[o.o]" : "(o.o)";
  if (st == "draft_preview") return cx ? "[^.^]" : "(^.^)";
  if (st == "agent_running") return cx ? "[*.*]" : "(*.*)";
  if (st == "done") return cx ? "[^o^]" : "\\(^o^)/";
  if (st == "error") return cx ? "[x.x]" : "(x.x)";
  return cx ? "[-.-]" : "(-.-)";
}
static const char* labelFor(const String& st) {
  if (st == "recording" || st == "streaming") return "listening";
  if (st == "transcribing") return "typing...";
  if (st == "draft_preview") return "review";
  if (st == "agent_running") return reqAttn ? "needs you" : "working";
  if (st == "done") return "done!";
  if (st == "error") return "error";
  return "ready";
}
static const char* hintFor(const String& st) {
  if (st == "draft_preview") return "A:send  B:redo";
  if (st == "agent_running") return reqAttn ? "check Mac" : "running...";
  return "hold A: talk  B: target";
}

// ---- transport ----
static void txMessage(JsonDocument& d) {
  if (useSerial) {
    serializeJson(d, Serial);
    Serial.print('\n');
  } else {
    String s;
    serializeJson(d, s);
    ws.sendTXT(s);
  }
}

static void txAudio(const int16_t* buf, size_t bytes) {
  if (!useSerial) {
    ws.sendBIN((uint8_t*)buf, bytes);
    return;
  }
  static unsigned char b64[(MIC_CHUNK * 2 + 2) / 3 * 4 + 8];
  size_t olen = 0;
  if (mbedtls_base64_encode(b64, sizeof(b64), &olen, (const unsigned char*)buf, bytes) == 0) {
    b64[olen] = 0;
    JsonDocument d;
    d["type"] = "audio.chunk";
    d["data"] = (const char*)b64;
    txMessage(d);
  }
}

static void sendHello() {
  JsonDocument d;
  d["type"] = "hello";
  d["protocolVersion"] = PROTOCOL_VERSION;
  d["deviceId"] = deviceId;
  d["firmware"] = FIRMWARE;
  if (pairCode.length()) d["token"] = pairCode;
  txMessage(d);
}

static void handleIncoming(JsonDocument& d) {
  const char* t = d["type"] | "";
  if (!strcmp(t, "welcome")) {
    linked = true;
    deviceState = "idle";
  } else if (!strcmp(t, "state.update")) {
    deviceState = (const char*)(d["state"] | "idle");
    if (d["task"].is<JsonObject>()) {
      agent = (const char*)(d["task"]["agent"] | "unknown");
      phase = (const char*)(d["task"]["phase"] | "");
      title = (const char*)(d["task"]["title"] | "");
      reqAttn = d["task"]["requiresMacAttention"] | false;
    }
  } else if (!strcmp(t, "draft.preview")) {
    deviceState = "draft_preview";
    draftId = (const char*)(d["draftId"] | "");
    target = (const char*)(d["target"] | "auto");
    draftPreview = (const char*)(d["shortPreview"] | "");
    riskLevel = (const char*)(d["riskLevel"] | "low");
  } else if (!strcmp(t, "task.update")) {
    agent = (const char*)(d["task"]["agent"] | "unknown");
    phase = (const char*)(d["task"]["phase"] | "");
    title = (const char*)(d["task"]["title"] | "");
    reqAttn = d["task"]["requiresMacAttention"] | false;
  } else if (!strcmp(t, "error")) {
    lastError = String((const char*)(d["code"] | "ERR")) + ": " + (const char*)(d["message"] | "");
  }
  needRedraw = true;
}

static void onWsEvent(WStype_t type, uint8_t* payload, size_t len) {
  if (type == WStype_CONNECTED) {
    sendHello();
  } else if (type == WStype_DISCONNECTED) {
    linked = false;
    needRedraw = true;
  } else if (type == WStype_TEXT) {
    JsonDocument d;
    if (!deserializeJson(d, payload, len)) handleIncoming(d);
  }
}

static void pollSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      if (rxLine.length()) {
        JsonDocument d;
        if (!deserializeJson(d, rxLine)) handleIncoming(d);
        rxLine = "";
      }
    } else if (c != '\r') {
      rxLine += c;
      if (rxLine.length() > 4096) rxLine = "";
    }
  }
}

static void render() {
  auto& g = M5.Display; // portrait: 135 wide x 240 tall
  g.fillScreen(TFT_BLACK);

  // top bar
  g.setTextSize(1);
  g.setTextColor(linked ? TFT_GREEN : TFT_DARKGREY, TFT_BLACK);
  g.setCursor(3, 4);
  g.printf("%s%s  b%d", useSerial ? "USB " : "WiFi ", linked ? "ok" : "..",
           M5.Power.getBatteryLevel());
  g.setTextColor(TFT_CYAN, TFT_BLACK);
  g.setCursor(3, 16);
  g.printf(">%s", target.c_str());

  // mascot (centered)
  uint16_t col = TFT_WHITE;
  if (deviceState == "done") col = TFT_GREEN;
  else if (deviceState == "error") col = TFT_RED;
  else if (deviceState == "agent_running" && reqAttn) col = TFT_ORANGE;
  g.setTextColor(col, TFT_BLACK);
  g.setTextSize(3);
  g.drawCenterString(faceFor(agent, deviceState), 67, 56);
  g.setTextSize(2);
  g.drawCenterString(labelFor(deviceState), 67, 104);

  // status block (wrapped)
  g.setTextSize(1);
  g.setTextWrap(true);
  if (deviceState == "draft_preview") {
    g.setTextColor(TFT_CYAN, TFT_BLACK);
    g.setCursor(3, 140);
    g.printf(">%s  risk:%s", target.c_str(), riskLevel.c_str());
    g.setTextColor(TFT_WHITE, TFT_BLACK);
    g.setCursor(3, 156);
    g.print(draftPreview.substring(0, 100));
  } else if (deviceState == "agent_running" || deviceState == "done") {
    g.setTextColor(TFT_CYAN, TFT_BLACK);
    g.setCursor(3, 140);
    g.printf("%s: %s", agent.c_str(), phase.c_str());
    g.setTextColor(TFT_WHITE, TFT_BLACK);
    g.setCursor(3, 156);
    g.print(title.substring(0, 100));
  } else if (deviceState == "error") {
    g.setTextColor(TFT_RED, TFT_BLACK);
    g.setCursor(3, 144);
    g.print(lastError.substring(0, 100));
  }
  g.setTextWrap(false);

  // hint
  g.setTextColor(TFT_DARKGREY, TFT_BLACK);
  g.setCursor(3, 226);
  g.print(hintFor(deviceState));
}

static void draftAction(const char* action) {
  JsonDocument d;
  d["type"] = "draft.action";
  d["draftId"] = draftId;
  d["action"] = action;
  txMessage(d);
}

static void startRecording() {
  recording = true;
  M5.Speaker.end();
  M5.Mic.begin();
  JsonDocument d;
  d["type"] = "audio.start";
  d["sessionId"] = "aud";
  d["sampleRate"] = 16000;
  d["channels"] = 1;
  d["format"] = "pcm16";
  txMessage(d);
  M5.Mic.record(micbuf, MIC_CHUNK, 16000);
  deviceState = "recording";
  needRedraw = true;
}

static void stopRecording() {
  recording = false;
  M5.Mic.end();
  JsonDocument d;
  d["type"] = "audio.stop";
  d["sessionId"] = "aud";
  d["durationMs"] = 0;
  txMessage(d);
}

static void drawSetup() {
  auto& g = M5.Display;
  g.fillScreen(TFT_BLACK);
  g.setTextColor(TFT_ORANGE);
  g.setTextSize(2);
  g.setCursor(6, 8);
  g.print("WiFi Setup");
  g.setTextSize(1);
  g.setTextColor(TFT_WHITE);
  g.setCursor(4, 40);
  g.print("Join Wi-Fi:");
  g.setCursor(4, 54);
  g.setTextColor(TFT_GREEN);
  g.print("vibestick-setup");
  g.setTextColor(TFT_WHITE);
  g.setCursor(4, 74);
  g.print("then set Wi-Fi + Bridge IP");
}

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(0); // portrait — natural for the stick
  Serial.setRxBufferSize(4096); // must precede begin(); large status JSON would
                                // otherwise overflow the default RX buffer and drop
  Serial.begin(115200);
  Serial.setTxTimeoutMs(50); // never hang when no host is reading the USB CDC
  M5.update();
  useSerial = !M5.BtnB.isPressed(); // hold BtnB at boot for Wi-Fi mode
  deviceId = "sticks3-" + WiFi.macAddress();

  if (useSerial) {
    M5.Display.fillScreen(TFT_BLACK);
  } else {
    prefs.begin("vibestick", false);
    bridgeHost = prefs.getString("host", "");
    pairCode = prefs.getString("code", "");
    WiFiManager wm;
    WiFiManagerParameter pHost("host", "Bridge IP (your Mac)", bridgeHost.c_str(), 40);
    WiFiManagerParameter pCode("code", "Pairing code (optional)", pairCode.c_str(), 8);
    wm.addParameter(&pHost);
    wm.addParameter(&pCode);
    wm.setConfigPortalTimeout(180);
    drawSetup();
    wm.autoConnect("vibestick-setup");
    bridgeHost = pHost.getValue();
    pairCode = pCode.getValue();
    prefs.putString("host", bridgeHost);
    prefs.putString("code", pairCode);
    if (bridgeHost.length() == 0 && MDNS.begin("vibestick-dev") &&
        MDNS.queryService("vibestick", "tcp") > 0) {
      bridgeHost = MDNS.IP(0).toString();
    }
    M5.Display.fillScreen(TFT_BLACK);
    if (bridgeHost.length()) {
      ws.begin(bridgeHost.c_str(), BRIDGE_PORT, "/");
      ws.onEvent(onWsEvent);
      ws.setReconnectInterval(2000);
    }
  }
  needRedraw = false;
  render(); // draw immediately, before any (possibly slow) network write
}

void loop() {
  M5.update();
  if (useSerial) {
    pollSerial();
    if (!linked && millis() - lastHello > 1000) {
      lastHello = millis();
      sendHello();
    }
  } else {
    ws.loop();
  }

  if (recording && linked && !M5.Mic.isRecording()) {
    txAudio(micbuf, MIC_CHUNK * sizeof(int16_t));
    M5.Mic.record(micbuf, MIC_CHUNK, 16000);
  }

  if (deviceState == "draft_preview") {
    if (M5.BtnA.wasClicked()) draftAction("send");
    if (M5.BtnB.wasClicked()) draftAction("retry");
  } else {
    if (M5.BtnA.wasPressed()) startRecording();
    if (M5.BtnA.wasReleased() && recording) stopRecording();
    if (M5.BtnB.wasClicked()) {
      targetIdx = (targetIdx + 1) % 5;
      target = TARGETS[targetIdx];
      JsonDocument d;
      d["type"] = "button.event";
      d["button"] = "secondary";
      d["gesture"] = "click";
      d["ts"] = millis();
      txMessage(d);
      needRedraw = true;
    }
  }

  if (millis() - lastHeartbeat > 5000) {
    lastHeartbeat = millis();
    if (linked) {
      JsonDocument d;
      d["type"] = "heartbeat";
      d["ts"] = millis();
      txMessage(d);
    }
    needRedraw = true;
  }

  if (needRedraw) {
    needRedraw = false;
    render();
  }
  delay(5);
}
