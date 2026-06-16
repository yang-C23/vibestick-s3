# Contributing

Thanks for helping build vibestick-s3! This is a monorepo with a TypeScript bridge/CLI and ESP32-S3
firmware.

## Dev environment

- Node ≥ 20, **pnpm 9** (`corepack enable`).
- For firmware: **PlatformIO** (`pip install platformio`). For STT/normalizer work, a local engine
  (Qwen3-ASR / FunASR / whisper.cpp) and optionally Ollama.
- No hardware? Use `examples/mock-bridge` + `examples/device-simulator` + `examples/mock-agent`.

## Workflow

- Default branch **main**; feature branches like `feat/voice-pipeline`, `fix/reconnect`.
- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
- One topic per PR. Keep commits small and runnable.
- Before pushing: `pnpm typecheck && pnpm test && pnpm schema:validate && pnpm format`.

## Ground rules

- **Never** commit secrets, tokens, `.env`, recordings, models, or personal paths.
- **No** API keys in firmware or on the device.
- **No** official logos/trademarked mascots — original art only in `assets/mascots/`.
- The device renders normalized state only — no raw diffs/logs pushed to it.
- Terminal injection must never auto-press Enter.

## Tests

- `packages/protocol` validates wire messages + normalizer output against JSON Schema.
- Add fixtures for the prompt normalizer under `packages/prompt-normalizer/fixtures`.

See [docs/roadmap.md](docs/roadmap.md) for milestones and good first areas.
