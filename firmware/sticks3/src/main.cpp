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
int16_t micbuf[2][MIC_CHUNK]; // double-buffered: keep capturing while a frame is sent
int micIdx = 0;

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

// Battery state + estimated remaining time. Uses the measured discharge current
// when the M5PM1 reports it, otherwise a nominal ~110mA estimate (250mAh cell).
static String batteryLine() {
  int lvl = M5.Power.getBatteryLevel();
  if (lvl < 0) return "battery: n/a";
  float mA = M5.Power.getBatteryCurrent(); // + charging, - discharging, 0 if unsupported
  bool charging = mA > 5 ? true : (mA < -5 ? false : ((int)M5.Power.isCharging() == 1));
  char buf[56];
  if (charging) {
    snprintf(buf, sizeof(buf), "charging via USB");
  } else {
    bool measured = mA < -5;
    float draw = measured ? -mA : 110.0f;
    int mins = (int)((lvl / 100.0f) * 250.0f / draw * 60.0f);
    if (measured) snprintf(buf, sizeof(buf), "~%dh%02dm left  %dmA", mins / 60, mins % 60, (int)draw);
    else snprintf(buf, sizeof(buf), "~%dh%02dm left (est)", mins / 60, mins % 60);
  }
  return String(buf);
}

// ---- transport ----
static void txMessage(JsonDocument& d) {
  String s;
  serializeJson(d, s);
  if (useSerial) {
    s += '\n';
    // bulk write — char-by-char serializeJson(d, Serial) is far too slow and
    // stalls the loop (drops mic audio) for big base64 frames.
    Serial.write((const uint8_t*)s.c_str(), s.length());
  } else {
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
  g.printf("%s%s  %d%%", useSerial ? "USB " : "WiFi ", linked ? "ok" : "..",
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

  // status block (wrapped) — Chinese-capable font for prompt/title text
  g.setFont(&fonts::efontCN_16);
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
  g.setFont(&fonts::Font0); // back to the default font for the ASCII hint/battery

  // battery + estimated runtime
  int blvl = M5.Power.getBatteryLevel();
  uint16_t bcol =
    (blvl >= 0 && blvl < 20) ? TFT_RED : (blvl >= 0 && blvl < 50) ? TFT_ORANGE : TFT_GREEN;
  g.setTextColor(bcol, TFT_BLACK);
  g.setCursor(3, 206);
  g.print(batteryLine());

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
  micIdx = 0;
  M5.Mic.record(micbuf[0], MIC_CHUNK, 16000);
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

  if (recording && !M5.Mic.isRecording()) {
    int done = micIdx;
    micIdx ^= 1;
    M5.Mic.record(micbuf[micIdx], MIC_CHUNK, 16000); // re-arm FIRST so the mic never pauses
    if (linked) txAudio(micbuf[done], MIC_CHUNK * sizeof(int16_t));
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
