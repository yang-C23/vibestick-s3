// Hardware-verification sketch: confirm KEY1/KEY2/power mapping + BMI270 IMU.
// Build: pio run -e button_test -t upload -t monitor
#include <M5Unified.h>

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(1);
  M5.Display.setTextSize(2);
  Serial.begin(115200);
  Serial.println("button_test: press KEY1/KEY2/PWR; tilt/shake to move accel");
}

void loop() {
  M5.update();
  if (M5.BtnA.wasClicked()) Serial.println("BtnA (KEY1?) click");
  if (M5.BtnA.wasHold()) Serial.println("BtnA hold");
  if (M5.BtnB.wasClicked()) Serial.println("BtnB (KEY2?) click");
  if (M5.BtnPWR.wasClicked()) Serial.println("BtnPWR click");

  float ax = 0, ay = 0, az = 0;
  M5.Imu.getAccel(&ax, &ay, &az);
  static uint32_t t = 0;
  if (millis() - t > 500) {
    t = millis();
    Serial.printf("accel %.2f %.2f %.2f\n", ax, ay, az);
    M5.Display.fillScreen(TFT_BLACK);
    M5.Display.setCursor(0, 0);
    M5.Display.printf("A=%d B=%d\nax%.1f\nay%.1f\naz%.1f", (int)M5.BtnA.isPressed(),
                      (int)M5.BtnB.isPressed(), ax, ay, az);
  }
  delay(10);
}
