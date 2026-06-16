# StickS3 firmware

PlatformIO + Arduino + M5Unified. **M0 status: skeleton.** It connects to Wi-Fi + the bridge
WebSocket, sends `hello`/`heartbeat`, forwards button events, and draws the pushed state. The full
UI, captive-portal pairing, and voice capture land in **M2/M3**.

## Build & flash

```sh
# main skeleton
pio run -e sticks3 -t upload -t monitor

# hardware-verification sketches (run these FIRST — see HARDWARE_CHECKLIST.md)
pio run -e button_test -t upload -t monitor
pio run -e audio_test  -t upload -t monitor
```

Edit the `// TODO` Wi-Fi/bridge constants in `src/main.cpp` for the skeleton (M2 replaces these with
NVS + a captive portal + mDNS discovery + 6-digit pairing).

## Restore stock firmware

Reflashing replaces UIFlow2 and is reversible — use **M5Burner** to restore UIFlow2.
