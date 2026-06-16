# Continue prompt — vibestick-s3

Paste this into a fresh Claude Code / Codex session to continue working on this project with full
context. Then state your new requirement at the bottom.

---

You are continuing work on **vibestick-s3**, an existing, working open-source project: an M5Stack
**StickS3** (ESP32-S3) hardware companion for vibe coding that gives **hands-free voice dictation**
and **glanceable agent status** for Codex CLI + Claude Code. It is already verified end-to-end on
real hardware with local models. Do NOT rebuild it — read it, then extend/optimize per my new
requirement at the end. Work in small PRs with Conventional Commits, run the gates before each
commit, and verify on the real device before claiming firmware changes work.

## Where things are

- Repo: `/Users/a/vibestick-s3` (GitHub `github.com/yang-C23/vibestick-s3`, default branch `main`,
  tagged `v0.1.0`). pnpm monorepo. Host: macOS 15 / Apple Silicon, 24 GB.
- Read first: `README.md`, `docs/{architecture,protocol,ux,integrations,setup}.md`,
  `firmware/sticks3/HARDWARE_CHECKLIST.md`. The protocol package is the source of truth for the wire
  format.

## Architecture (3 layers)

- **Firmware** `firmware/sticks3` (PlatformIO + Arduino + M5Unified). Thin client: mic capture,
  buttons, mascot/status UI, push-to-talk. **Dual transport**: USB serial by default; hold **BtnB at
  boot** for Wi-Fi (captive portal). `src/main.cpp` is the whole firmware.
- **Bridge** `apps/bridge` (= `vibestickd`, TypeScript, run via `tsx`). Transport-agnostic `Conn`
  abstraction shared by a WebSocket server (`:47600`) and a USB **serial** transport (`serial.ts`,
  auto-detects `/dev/cu.usbmodem*`). HTTP control on `:47601` (`/health /status /event /pair
  /inject`). Pipeline = STT → normalizer → draft; plus inject + status-store.
- **CLI** `apps/cli` (= `vibestick`): `start ping pair status send-test doctor send watch
  install-hooks uninstall-hooks`.
- **Packages**: `protocol` (wire messages + `VibeTask` model + strict normalizer JSON schema),
  `status-store`, `audio` (WAV + pluggable STT providers + Python sidecar in `audio/sidecar/`),
  `prompt-normalizer` (backends: `deterministic` | `ollama` | `claude`), `integrations/{clipboard,
  terminal,codex,claude}`, `mascots`.
- **Examples** (develop without hardware): `examples/{mock-bridge,device-simulator,mock-agent}`.

## Local models (already installed on this Mac)

- **STT**: FunASR SenseVoice via a Python sidecar. venv at `~/.vibestick/stt-venv`, server
  `packages/audio/sidecar/server.py` on `:47610`. `VIBESTICK_STT_PROVIDER=funasr`.
- **Normalizer LLM**: native Ollama (`~/.vibestick/bin/ollama`, app `~/Applications/Ollama.app`) +
  `qwen3:4b` on `:11434`. `VIBESTICK_NORMALIZER_BACKEND=ollama VIBESTICK_NORMALIZER_MODEL=qwen3:4b`.
- **Run everything**: `./scripts/start.sh` (starts Ollama + STT sidecar + the bridge with the right
  env). Bridge binds `0.0.0.0` so both USB and Wi-Fi work.

## Verified hardware facts (don't regress)

- ESP32-S3-PICO-1, 8 MB flash + **8 MB QUAD PSRAM** → `board_build.arduino.memory_type = qio_qspi`
  (`qio_opi` boot-loops to a black screen).
- **BtnA = the front blue button** (record / primary / "send" in review). **BtnB = right-side
  button** (cycle target; hold at boot = Wi-Fi mode). Power button = on/reset (single), off (double),
  download mode (long-press).
- BMI270 IMU, ES8311 mic, ST7789P3 display. Chinese renders with M5GFX `fonts::efontCN_16`. Port
  `/dev/cu.usbmodem101`.

## Flashing workflow (native-USB quirks — important)

1. Stop the bridge so it releases the serial port: `pkill -9 -f "src/index.ts"` and free ports
   47600/47601.
2. **Download mode**: long-press power ~6 s (screen blank / green LED blinks). esptool's auto-reset
   does NOT enter it.
3. `cd firmware/sticks3 && pio run -e sticks3 -t upload --upload-port /dev/cu.usbmodem101`
4. **Boot**: single-press power (the RTS hard-reset will NOT launch the app).
5. Restart the bridge (`./scripts/start.sh`).

## Hard-won lessons baked into the code (keep them)

- Firmware: `Serial.begin()` + `Serial.setTxTimeoutMs(50)` before any write (USB CDC blocks with no
  host → setup hangs → black screen); `render()` at end of `setup()` before any network write;
  `Serial.setRxBufferSize(4096)` before `begin()` (big status JSON overflows the default RX buffer →
  dropped messages); **double-buffered mic + bulk `Serial.write`** (char-by-char `serializeJson(d,
  Serial)` stalls the loop and drops audio → "only the first half").
- Audio: serial sends PCM as base64 `audio.chunk`; Wi-Fi sends binary frames. 16 kHz mono PCM16.
- Normalizer: **coerce** the LLM JSON (clamp out-of-enum values) instead of discarding it; **hybrid**
  target fill from rule-based routing; **keep the user's language** (no translation); map STT
  mishears (cloud→claude, codecs/cortex→codex); `think:false` so Qwen3 emits JSON directly. Any
  backend failure falls back to the offline deterministic cleaner.

## Dev workflow & rules

- Gates (must pass before commit): `pnpm format`, `pnpm typecheck`, `pnpm test`, `pnpm
  schema:validate`. 52 tests currently pass.
- Feature branch → Conventional Commits → `git merge --no-ff` to `main` → push. End commit messages
  with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Firmware builds: `pio run -e sticks3` (also `-e button_test` / `-e audio_test` for bring-up).
- Constraints: no API keys on the device; never auto-press Enter on injection; original mascots only
  (no official logos); local-first (cloud is opt-in).

## Known future work (not started)

ESP Web Tools web-flasher + npm publish; IMU raise-to-wake / shake-to-cancel; screen standby + deep
sleep; multi-session cycling; record-to-PSRAM for long utterances; better handling of English brand
words in Chinese STT; on-device draft editing.

---

**My new requirement:** <describe what you want changed or added here>
