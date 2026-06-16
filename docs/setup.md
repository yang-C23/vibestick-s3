# Setup — vibestick-s3 (macOS / Apple Silicon)

End-to-end setup: local AI models → flash the StickS3 → run. Everything runs on your Mac;
no cloud, no API keys required.

## Prerequisites

- **Node ≥ 20** + **pnpm 9** (`corepack enable`)
- **PlatformIO** (`pip install platformio`) to build/flash the firmware
- **ffmpeg** (for the STT sidecar to decode audio) — `brew install ffmpeg`
- An M5Stack **StickS3** + USB-C cable

```sh
corepack enable && pnpm install
```

## 1. Local models (Chinese-first, on-device)

### STT — FunASR SenseVoice

```sh
python3 -m venv ~/.vibestick/stt-venv
~/.vibestick/stt-venv/bin/pip install -U pip funasr torch torchaudio
# the sidecar downloads the model on first use; start it via scripts/start.sh
```

### Normalizer LLM — Ollama + Qwen3

Install native Apple-Silicon Ollama from <https://ollama.com/download> (not Intel Homebrew, for
Metal speed), then:

```sh
ollama pull qwen3:4b      # ~2.5GB; the dense Qwen3 4B is instruct/chat-tuned
```

> Don't want the LLM? Set `VIBESTICK_NORMALIZER_BACKEND=deterministic` — the built-in rule-based
> cleaner works offline with zero setup (less smart at restructuring vague speech).

## 2. Flash the firmware

The StickS3's native USB needs **manual** download mode (esptool's auto-reset doesn't catch it):

1. **Download mode:** long-press the power button (~6 s) until the screen is blank / green LED blinks.
2. `cd firmware/sticks3 && pio run -e sticks3 -t upload --upload-port /dev/cu.usbmodem101`
3. **Boot:** single-press the power button (or replug USB).

It boots into **USB-serial** mode by default. Hold **BtnB (right-side button)** at boot for **Wi-Fi**
mode (captive portal: join `vibestick-setup`, set your Wi-Fi + the Mac's LAN IP). See
[HARDWARE_CHECKLIST.md](../firmware/sticks3/HARDWARE_CHECKLIST.md).

## 3. Run

```sh
./scripts/start.sh        # starts Ollama + STT sidecar + the bridge
```

The bridge auto-detects the Stick over USB; for Wi-Fi it listens on the LAN (allow `node` in the
macOS firewall the first time). When linked, the top-left of the screen shows `USB ok` / `WiFi ok`.

## 4. Use it

- **Dictate:** hold the **blue button (BtnA)**, speak (中文/English/mixed), release → the Mac
  transcribes + cleans it → a **review** draft appears → press **BtnA** to send (pastes into the
  focused app / clipboard; it never presses Enter). **BtnB** cycles the target.
- **Monitor:** wire your agents so the Stick shows live status —
  `vibestick install-hooks` (Claude Code + Codex), or `vibestick watch -- codex exec "…"`.

## Config

All via env (see [.env.example](../.env.example)): `VIBESTICK_STT_PROVIDER`,
`VIBESTICK_NORMALIZER_BACKEND`/`_MODEL`, `VIBESTICK_BIND`, `VIBESTICK_INJECT_AUTOPASTE`, etc.
