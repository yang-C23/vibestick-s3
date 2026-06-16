# vibestick-s3

> A hardware companion for **vibe coding**: an M5Stack **StickS3** that lets you dictate prompts
> hands-free and watch **Codex CLI** / **Claude Code** status at a glance.

Hold the button, speak (中文 / English / mixed), and your Mac transcribes it **locally**, cleans it
into a well-structured prompt, previews a summary on the device, and — on your confirm — pastes it
into the focused tool (you press Enter). Meanwhile the screen shows the current agent task with an
original mascot and beeps when it needs you.

**Status: M0 (design-first foundation).** The full pipeline already runs end-to-end in software via
the mock bridge + device simulator — no hardware required yet.

## Why

- 🎙️ **Push-to-talk dictation** — stop typing long instructions.
- 👀 **Glanceable status** — working / done / needs-approval, without alt-tabbing.
- 🔒 **Local & private** — no API keys on the device; cloud is opt-in; Chinese-first local STT.

## Supported hardware

M5Stack **StickS3** (ESP32-S3-PICO-1-N8R8, 1.14″ 135×240, BMI270 IMU, ES8311 mic, Wi-Fi/BLE). Other
M5 sticks may work with config changes.

## Architecture (three layers)

- **Firmware** (StickS3): buttons, IMU, mic, screen/pet, Wi-Fi, pairing.
- **Bridge** (`vibestickd` + `vibestick` CLI, on the Mac): STT, prompt cleanup, Codex/Claude
  adapters, terminal/clipboard injection, status aggregation. Holds all keys.
- **Optional BLE-HID** fallback (off by default).

See [docs/architecture.md](docs/architecture.md) · [product](docs/product.md) · [ux](docs/ux.md) ·
[protocol](docs/protocol.md) · [integrations](docs/integrations.md) · [roadmap](docs/roadmap.md) ·
[troubleshooting](docs/troubleshooting.md).

## Try it now (no hardware)

```sh
corepack enable && pnpm install

# terminal 1 — fake bridge
pnpm --filter @vibestick/mock-bridge dev
# terminal 2 — device screen in your terminal (interactive: r=record s=send x=redo c=target q=quit)
pnpm --filter @vibestick/device-simulator dev
# terminal 3 — drive the agent-monitor flow
pnpm --filter @vibestick/mock-agent dev

# automated smoke run of the whole chain:
pnpm --filter @vibestick/device-simulator dev -- --script
```

## Run the bridge daemon (M1)

```sh
# start the real daemon: device WS :47600, control HTTP :47601, mDNS _vibestick._tcp.local
pnpm --filter vibestickd dev

# control it from another terminal (run the bin directly so flags parse):
node_modules/.bin/tsx apps/cli/src/index.ts ping
node_modules/.bin/tsx apps/cli/src/index.ts send-test --agent codex --status needs_approval --phase waiting --title "git push"
node_modules/.bin/tsx apps/cli/src/index.ts status
node_modules/.bin/tsx apps/cli/src/index.ts pair    # 6-digit pairing code
node_modules/.bin/tsx apps/cli/src/index.ts send "fix the bug in auth.ts" --target clipboard
node_modules/.bin/tsx apps/cli/src/index.ts watch -- codex exec "add a README"   # streams status to the device
```

`send` injects via the clipboard (auto-paste into the focused terminal is opt-in and **never**
presses Enter). `watch` wraps a `codex`/`claude` run and streams its phase to the device.

The `device-simulator` connects to this daemon the same way it connects to the mock bridge. After
packaging (M7) these become the `vibestickd` and `vibestick` binaries.

## Develop

```sh
pnpm typecheck      # all packages
pnpm test           # vitest (protocol schema/round-trip)
pnpm schema:validate
pnpm format         # prettier
```

## Repository

`packages/protocol` (wire contract + task model + normalizer schema) · `packages/{audio,
prompt-normalizer,status-store,integrations/*}` · `apps/{bridge,cli}` · `firmware/sticks3` ·
`examples/{mock-bridge,device-simulator,mock-agent}` · `assets/mascots` (original art only) · `docs`.

## License

MIT. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
