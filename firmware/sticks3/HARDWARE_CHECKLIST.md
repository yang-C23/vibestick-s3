# StickS3 hardware verification — CONFIRMED on device (2026-06)

Verified on a real M5Stack StickS3 (ESP32-S3-PICO-1, MAC 70:04:1d:db…) with `button_test`.

| Item | Confirmed value |
| --- | --- |
| MCU | ESP32-S3-PICO-1 rev v0.2 — WiFi+BLE, **8 MB flash (GD)**, **8 MB QUAD PSRAM (AP_3v3)** |
| PlatformIO PSRAM mode | `board_build.arduino.memory_type = qio_qspi` (octal/`qio_opi` boot-loops!) |
| **M5.BtnA (KEY1)** | **front blue long-bar button on the screen face** → primary / "record" |
| **M5.BtnB (KEY2)** | **right-side rectangular button** → secondary |
| M5.BtnPWR | side power button: single-press = reset/power-on · long-press = download mode |
| IMU | BMI270 — ax/ay/az respond to rotation ✓ |
| Display | 1.14″ ST7789P3 — auto-detected by M5Unified/M5GFX (StickS3 in their board tables) ✓ |
| M5Unified / M5GFX | 0.2.17 / 0.2.22 (both know the StickS3) |

## Flashing workflow (native USB quirk)

esptool's auto-reset leaves these boards in the ROM bootloader, so:

1. **Enter download mode:** long-press the power button (~6 s) until the screen is blank (green LED blinks).
2. `pio run -e <env> -t upload --upload-port /dev/cu.usbmodem101`
3. **Boot the app:** single-press the power button (or replug USB) — esptool's RTS reset won't launch it.
