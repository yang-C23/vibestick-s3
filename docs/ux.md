# UX — states, controls, screen

## State machine

`idle · pairing · connected · recording · streaming · transcribing · draft_preview · sending ·
agent_running · done · error`

(Enum: `packages/protocol/src/messages.ts` → `DEVICE_STATES`.)

## Controls

Physical: **primary (KEY1 / GPIO11, the "record" button, blue accent)**, **secondary (KEY2 /
GPIO12)**, **power (M5PM1, hardware on/off)**. IMU = BMI270. **All mappings are configurable.**

| State | Primary (KEY1) | Secondary (KEY2) | IMU |
| --- | --- | --- | --- |
| Idle | short=task detail · **hold=record** · double=resume last draft | short=cycle target (Auto→Claude→Codex→Clipboard→Terminal) · hold=settings | shake=refresh · face-down=privacy mute · raise=wake |
| Recording | hold; **release=stop+transcribe** | short=cancel | shake=cancel · auto-stop ~60 s |
| Transcribing | short=retry (on fail) | short=discard | — |
| Draft preview | short=**Send** (paste, *no Enter*) · hold=append voice edit · double=restore last sent | short=cycle action (Send/Copy/Overlay/SaveDraft) · hold=cancel | tilt=scroll · shake=discard (confirm within 1 s) |
| Agent running | short=task detail | short=cycle session | raise=wake |

## Screen layout (135×240)

- **Top bar (~18 px):** Wi-Fi, battery, current target, bridge latency.
- **Middle (~150 px):** mascot + state animation + phase.
- **Bottom (~60 px):** short preview / status text + button hints.
- **Error:** big icon + 1 line error + 1 line action (e.g. "Mac bridge offline", "STT failed",
  "Needs approval on Mac").

The draft preview shows: target, a short summary (not the full prompt), **risk flags** (destructive /
deploy / `git push` / `rm` / db-write / possible-secret), and hints. If Mac approval or a diff review
is needed, the device only says **"check Mac"** — no remote approval in MVP.

## Mascots

Original characters only — e.g. Codex = robot/owl, Claude = fox/capybara/bookworm. Per-state sprites:
idle=sleep, recording=ears-up, transcribing=typing, running=tapping, needs_approval=raised-hand,
done=celebrate, failed=confused. Users may drop custom art into `assets/mascots/`. **No official
logos.**

## Power / standby / wake

Dim ~20 s idle → backlight off ~60 s (WebSocket stays alive so alerts can re-wake). Wake on BMI270
raise, any button, or a waiting/done push (+beep). Deep sleep (Wi-Fi off, M5PM1 low-power level)
after ~10 min idle; wake on button + reconnect. Battery % / charging from M5PM1.

A terminal preview of all of this is the `examples/device-simulator` ASCII screen.
