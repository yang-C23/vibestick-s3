# Troubleshooting

## Device can't find the bridge
- Ensure the Mac and StickS3 are on the **same Wi-Fi** (and the network allows mDNS / Bonjour).
- Check `vibestickd` is running and `VIBESTICK_BIND` allows your LAN (default `127.0.0.1` is
  localhost-only; set a LAN IP/`0.0.0.0` to accept the device, behind your firewall).
- Re-pair: run the bridge's pair command and re-enter the 6-digit code.

## Pairing fails / "PROTOCOL_VERSION" error
- Update the firmware — the device protocol version is older than the bridge minimum.

## "STT failed" on the device
- Confirm the selected `VIBESTICK_STT_PROVIDER` engine/sidecar is installed and reachable at
  `VIBESTICK_STT_SIDECAR_URL` (`vibestick doctor`).
- For `whispercpp`, ensure `whisper-cli` + the model file exist. For `qwen3-asr`, ensure the MLX/C
  sidecar is running. For cloud providers, ensure the key is set in `.env`.

## Pasting into the terminal does nothing
- Auto-paste requires macOS **Accessibility** permission for your terminal/`osascript`. Grant it in
  System Settings → Privacy & Security → Accessibility. By design the bridge **never presses Enter** —
  press Enter yourself.
- If Accessibility is off, use **clipboard** target and paste with Cmd+V.

## No status / pet never updates
- For hook-based status, run `vibestick install-hooks --codex|--claude` and confirm the events reach
  `vibestickd` (check logs). Alternatively use the `vibestick watch -- …` wrapper.

## Develop without hardware
- Run `pnpm --filter @vibestick/mock-bridge dev`, then `pnpm --filter @vibestick/device-simulator dev`
  (add `-- --script` for an automated run), and `pnpm --filter @vibestick/mock-agent dev` to drive
  the monitor flow.

## Restore the stock firmware
- Reflashing replaces UIFlow2 but is reversible: use **M5Burner** to restore the UIFlow2 firmware.
