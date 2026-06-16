# Protocol — device ↔ bridge

Transport: **WebSocket** over Wi-Fi (LAN). JSON text frames for control; **binary frames** for audio.
The TypeScript types and JSON Schemas in **`packages/protocol`** are the source of truth; this doc
mirrors them. Current `PROTOCOL_VERSION = 1`.

## Handshake & versioning

1. Device connects, sends `hello { protocolVersion, deviceId, firmware, token? }`.
2. Bridge negotiates (`negotiateVersion`); on success replies `welcome { protocolVersion, deviceId,
   config }`, then an initial `state.update`. On failure: `error { code: "PROTOCOL_VERSION", ... }`.
3. Heartbeat: device sends `heartbeat { ts }`, bridge replies `pong { ts }`. Auto-reconnect on drop.

## Device → Bridge

| Type | Fields |
| --- | --- |
| `hello` | protocolVersion, deviceId, firmware, token? |
| `heartbeat` | ts |
| `button.event` | button (`primary`/`secondary`/`power`), gesture (`click`/`double_click`/`long_press_start`/`long_press_end`), ts |
| `imu.event` | gesture (`shake`/`raise`/`tilt_left`/`tilt_right`/`face_down`/`face_up`), ts |
| `audio.start` | sessionId, sampleRate (16000), channels (1), format (`pcm16`) |
| *(binary)* | raw PCM16 frames for the active session |
| `audio.stop` | sessionId, durationMs |
| `draft.action` | draftId, action (`send`/`copy_only`/`save_draft`/`append`/`restore_last`/`cancel`/`retry`) |

## Bridge → Device

| Type | Fields |
| --- | --- |
| `welcome` | protocolVersion, deviceId, config (`recordMaxMs`, `autoPaste`, `mascotPack`) |
| `state.update` | state (DeviceState), task? (VibeTask \| null) |
| `draft.preview` | draftId, target, shortPreview, riskLevel, needsClarification, clarificationQuestion? |
| `task.update` | task (VibeTask) |
| `config` | config (DeviceConfig) |
| `error` | code, message |
| `pong` | ts |

## Audio framing

`audio.start` (JSON) → N binary PCM16 frames (16 kHz mono) → `audio.stop` (JSON). The bridge buffers
to a temp WAV and runs STT. Keep frames small (e.g. 20–40 ms) for responsiveness.

## Validation

`schema/wire-messages.schema.json` validates every control message; `schema/normalizer-result.schema.json`
validates normalizer output. CI runs `pnpm schema:validate` + protocol tests.
