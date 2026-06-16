// Hardware-verification sketch: confirm the MEMS mic + ES8311 capture path.
// Build: pio run -e audio_test -t upload -t monitor ; speak and watch RMS rise.
#include <M5Unified.h>
#include <math.h>

static constexpr size_t N = 1600; // 100 ms @ 16 kHz
static int16_t buf[N];

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Display.setRotation(1);
  M5.Display.setTextSize(2);
  Serial.begin(115200);
  M5.Mic.begin();
  Serial.println("audio_test: speak into the mic; RMS should rise");
}

void loop() {
  M5.update();
  if (M5.Mic.isEnabled() && M5.Mic.record(buf, N, 16000)) {
    while (M5.Mic.isRecording()) delay(1);
    long long sum = 0;
    for (size_t i = 0; i < N; i++) sum += (long long)buf[i] * buf[i];
    int rms = (int)sqrt((double)sum / N);
    M5.Display.fillScreen(TFT_BLACK);
    M5.Display.setCursor(0, 0);
    M5.Display.printf("mic RMS\n%d", rms);
    Serial.printf("rms %d\n", rms);
  }
  delay(50);
}
