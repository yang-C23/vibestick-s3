// vibestick-s3 firmware skeleton (M0). See docs/protocol.md for the wire format.
// M2 replaces the hard-coded Wi-Fi/bridge constants with NVS + captive portal +
// mDNS discovery of _vibestick._tcp.local + 6-digit pairing, and adds the full UI.
#include <ArduinoJson.h>
#include <M5Unified.h>
#include <WebSocketsClient.h>
#include <WiFi.h>

// TODO(M2): move to NVS + pairing flow.
static const char* WIFI_SSID = "YOUR_WIFI";
static const char* WIFI_PASS = "YOUR_PASS";
static const char* BRIDGE_HOST = "192.168.1.50"; // TODO: mDNS discovery
static const uint16_t BRIDGE_PORT = 47600;
static const int PROTOCOL_VERSION = 1;
static const char* FIRMWARE = "0.0.1-skeleton";

static WebSocketsClient ws;
static uint32_t lastHeartbeat = 0;

static void drawState(const char* state) {
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setCursor(4, 4);
  M5.Display.setTextSize(2);
  M5.Display.printf("vibestick\n%s", state);
}

static void sendJson(JsonDocument& doc) {
  String out;
  serializeJson(doc, out);
  ws.sendTXT(out);
}

static void sendHello() {
  JsonDocument doc;
  doc["type"] = "hello";
  doc["protocolVersion"] = PROTOCOL_VERSION;
  doc["deviceId"] = String("sticks3-") + WiFi.macAddress();
  doc["firmware"] = FIRMWARE;
  sendJson(doc);
}

static void onWsEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      sendHello();
      break;
    case WStype_TEXT: {
      JsonDocument doc;
      if (deserializeJson(doc, payload, length)) return;
      const char* t = doc["type"] | "";
      if (strcmp(t, "state.update") == 0) drawState(doc["state"] | "?");
      else if (strcmp(t, "welcome") == 0) drawState("connected");
      else if (strcmp(t, "draft.preview") == 0) drawState("draft");
      break;
    }
    default:
      break;
  }
}

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(1);
  drawState("boot");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) delay(200);
  drawState(WiFi.status() == WL_CONNECTED ? "wifi ok" : "wifi fail");

  ws.begin(BRIDGE_HOST, BRIDGE_PORT, "/");
  ws.onEvent(onWsEvent);
  ws.setReconnectInterval(2000);
}

void loop() {
  M5.update();
  ws.loop();

  // KEY1 = primary "record" button (push-to-talk). Verify mapping with button_test.
  if (M5.BtnA.wasPressed()) {
    JsonDocument d;
    d["type"] = "button.event";
    d["button"] = "primary";
    d["gesture"] = "long_press_start";
    d["ts"] = millis();
    sendJson(d);
  }
  if (M5.BtnA.wasReleased()) {
    JsonDocument d; // M3 streams real audio between press/release; skeleton just signals stop.
    d["type"] = "audio.stop";
    d["sessionId"] = "aud";
    d["durationMs"] = 0;
    sendJson(d);
  }
  if (M5.BtnB.wasClicked()) {
    JsonDocument d;
    d["type"] = "button.event";
    d["button"] = "secondary";
    d["gesture"] = "click";
    d["ts"] = millis();
    sendJson(d);
  }

  if (millis() - lastHeartbeat > 5000) {
    lastHeartbeat = millis();
    JsonDocument d;
    d["type"] = "heartbeat";
    d["ts"] = millis();
    sendJson(d);
  }
}
