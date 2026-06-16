# Product — vibestick-s3

## What it is

A hardware companion for **vibe coding**: an M5Stack **StickS3** that helps you drive and watch
**Codex CLI** and **Claude Code** on a MacBook (terminals, apps, and plain text fields). Two jobs:

1. **Hands-free dictation** — hold the record button, speak (中文 / English / mixed technical
   speech), and the Mac transcribes it locally, cleans it into a well-structured prompt, previews a
   summary on the device, and — on your confirmation — pastes it into the focused tool (you press
   Enter).
2. **At-a-glance status** — the screen shows the current agent task state (idle, recording,
   transcribing, draft ready, sent, running, needs-approval, done, failed) using an original mascot
   per app, plus a beep/wake when the agent needs you.

## Why a physical device

A dedicated peripheral removes friction that a screen widget can't: a real **push-to-talk button**
under your thumb, a **glanceable status light/pet** you can see without alt-tabbing, and a **haptic/
audible nudge** when the agent is blocked — so you can look away while it works and get tapped on the
shoulder when it needs a decision.

## MVP (v0.1)

- Wi-Fi pairing (mDNS + 6-digit code) between device and a local Mac bridge.
- Push-to-talk capture → local STT (Chinese-first) → prompt cleanup → on-device preview → confirm.
- Send targets: **clipboard** and **terminal paste (no auto-Enter)**; `claude -p` / `codex exec`
  wrappers for status.
- Live status display with original mascots and clear error states.
- Everything local: **no API keys on the device**; cloud is opt-in only.

## Non-goals (v1)

- The device is **not** a full on-device agent and stores **no** AI API keys.
- **No** on-device approval of dangerous operations — approve on the Mac.
- **No** full diffs/logs on the 135×240 screen — the device shows normalized state only.
- **No** official logos/trademarked mascots bundled in the repo.

## Primary user scenarios

- *Dictate a task:* "嗯，帮我把 `auth.ts` 里那个回调的 bug 修一下，然后加个测试" → cleaned to a
  precise instruction, previewed, pasted into Claude Code.
- *Glance while multitasking:* Codex is running tests; the pet shows "running"; on a permission
  prompt the device beeps and shows "needs approval — check Mac".
- *Reuse last:* double-press to restore the last draft and re-send to a different target.

See [architecture.md](./architecture.md) for how the layers fit together and [ux.md](./ux.md) for the
full interaction design.
