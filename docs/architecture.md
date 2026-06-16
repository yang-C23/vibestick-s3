# Architecture — vibestick-s3

## Three layers

| Layer | Runs on | Responsibility |
| --- | --- | --- |
| **Firmware** | StickS3 (ESP32-S3) | Buttons, IMU gestures, mic capture, screen/pet, beeps, Wi-Fi, pairing, small cache. Thin client. |
| **Bridge** (`vibestickd` + `vibestick` CLI) | MacBook | STT, prompt cleanup/structuring, Codex/Claude adapters, terminal/clipboard injection, status aggregation, security, logging, config. The brains. |
| **Optional BLE-HID** | StickS3 → focused window | Backstop only (default OFF): type the final confirmed text as keyboard input when Wi-Fi/bridge is down. Never the main path. |

```
 StickS3 firmware  ──Wi-Fi WebSocket (LAN, mDNS + token)──  vibestickd (Mac)
   buttons/IMU          hello / button / audio / draft.action  ─►   ws server + pairing
   ES8311 mic           ◄─ state.update / draft.preview / task        packages/audio → STT
   ST7789 screen                                                      prompt-normalizer
   M5PM1 power                                                        integrations L1–L4
                                                                      status-store (VibeTask)
                          ┌─ HTTP/stdio (metadata only) ─┐            inject: clipboard+osascript
              Claude Code (hooks / `claude -p`)   Codex (hooks / `codex exec --json` / SDK)
```

## Main chain

`hold-to-record → stream PCM → Mac STT → normalize → device preview → confirm → send → status`

## Link & discovery

- Device joins Wi-Fi, discovers the bridge via mDNS `_vibestick._tcp.local`.
- First run: bridge shows a **6-digit pairing code**; on match it issues `deviceId` + `token`
  (stored in device NVS). Every WebSocket connect carries `deviceId` + `token`.
- `hello` carries `protocolVersion`; the bridge negotiates (see `packages/protocol/src/version.ts`).
- Binary WebSocket frames carry 16 kHz mono PCM16 audio for the active session; JSON frames carry
  control messages.

## Security model

- **API keys live only on the Mac** (`.env` / Keychain / shell env) — never on the device.
- Bridge binds `127.0.0.1` / LAN only; **no public port**.
- **Log redaction** for API keys, tokens, SSH keys, `.env` contents, cookies.
- Hooks/wrappers forward **metadata + summaries**, not full code diffs, unless the user opts in.
- BLE-HID is off by default; auto-paste requires explicit macOS Accessibility opt-in and **never**
  presses Enter.

## Repository (pnpm monorepo)

`packages/protocol` (wire contract + task model + normalizer schema), `packages/audio` (STT),
`packages/prompt-normalizer`, `packages/status-store`, `packages/integrations/*`, `apps/bridge`
(`vibestickd`), `apps/cli` (`vibestick`), `firmware/sticks3`, `examples/*` (mock-bridge,
device-simulator, mock-agent — develop without hardware), `assets/mascots` (original art only).

The protocol package is the **single source of truth** for the wire format; docs/protocol.md mirrors
it.
