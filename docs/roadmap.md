# Roadmap

## Milestones to v0.1.0

| # | Milestone | Outcome |
| --- | --- | --- |
| **M0** | Research & RFC | Verified hardware, 7 docs, protocol schema, **mock bridge + device simulator** (develop without hardware), monorepo + CI + PROMPT.md + firmware test stubs. |
| **M1** | Bridge skeleton | `vibestickd` WS server + mDNS + 6-digit pairing; `status-store`; `vibestick` CLI (ping/status/send-test); simulator renders pushed state. |
| **M2** | Firmware skeleton | StickS3 UI, Wi-Fi captive portal, WS connect + pairing, KEY1/KEY2 events, screen reflects bridge state, heartbeat/reconnect. Verify pins via `button_test`/`audio_test`. |
| **M3** | Voice MVP | Push-to-talk PCM16 streaming → WAV → STT (mock + Qwen3-ASR); handle timeout/dropout/empty audio. |
| **M4** | Normalizer | Transcript → strict JSON (zh/en/mixed); fixtures (filler removal, identifier preservation, target/risk/clarification); device preview + confirm/append/restore. |
| **M5** | Send adapters | Clipboard; terminal paste (opt-in, no Enter); `claude -p` + `codex exec --json` wrappers → unified task state. |
| **M6** | Agent status display | running/needs-approval/done/failed; original mascot sprites; hooks installer v1; clear device error states. |
| **M7** | OSS polish | README, full CI, release workflow + firmware `.bin` + ESP Web Tools flasher + npm; demo; tag **v0.1.0**. |

## Beyond v0.1

- **v0.2:** Opus audio compression; realtime/partial transcripts; multi-session cycling; OTA firmware
  update; Tauri tray app; richer mascot packs.
- **v0.3:** Codex SDK/app-server deep integration; `vibestick-mcp` full server; per-project profiles;
  optional BLE-HID fallback hardening; on-device quick-replies.
