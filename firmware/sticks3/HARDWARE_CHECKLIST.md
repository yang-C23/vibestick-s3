# StickS3 hardware-verification checklist

Do **not** trust the button/pin map until these are confirmed on a real device. Documented values
(from M5Stack docs) are the starting point; verify them with the test sketches.

| Item | Documented (verify!) | How to confirm |
| --- | --- | --- |
| MCU | ESP32-S3-PICO-1-N8R8 (8 MB flash, 8 MB PSRAM) | boot log / `pio device monitor` |
| User buttons | KEY1 = GPIO11, KEY2 = GPIO12 (M5.BtnA / M5.BtnB) | `pio run -e button_test -t upload`; press each, watch serial |
| Power button | M5PM1 PMIC: single=on/reset, double=off, long=download | physical test; M5.BtnPWR events |
| IMU | BMI270 @ I2C 0x68 | button_test prints accel; tilt/shake/raise should change values |
| Mic | MEMS + ES8311 codec | `pio run -e audio_test -t upload`; speak, watch RMS rise |
| Display | 1.14" 135×240, ST7789P3 | drawn by both sketches |
| Battery / charge | 250 mAh via M5PM1 | `M5.Power.getBatteryLevel()` once M5Unified support confirmed |

Record confirmed values back into `src/` and this file, then proceed to M2.
