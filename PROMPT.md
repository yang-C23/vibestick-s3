# Master prompt — build/extend `vibestick-s3`

Hand this to Codex or Claude Code to build or extend the project. It is self-contained and tells the
agent to produce the **architecture RFC + repo skeleton first**, not full firmware.

---

You are the principal engineer, embedded engineer, macOS-toolchain engineer, and OSS maintainer for
`vibestick-s3`: turn an M5Stack StickS3 (ESP32-S3) into a hands-free tool to control & monitor Codex
CLI + Claude Code on a MacBook (terminals, apps, plain text inputs). **Do design + skeleton first —
do NOT dump full firmware immediately.** Work in small PRs, Conventional Commits, with tests.

## Product positioning (v1)

Three layers, no API keys on the device:

- StickS3 firmware = thin client: buttons, voice capture, status display, beeps, IMU gestures,
  Wi-Fi, pairing, small cache.
- Mac bridge (`vibestickd` daemon + `vibestick` CLI) = brains: STT, prompt cleanup/structuring,
  Codex/Claude adapters, terminal/clipboard injection, status aggregation, security, logging,
  config.
- Optional BLE-HID fallback (default OFF): type only the final confirmed text into the focused
  window.

Main chain: hold record → Mac transcribes → AI cleans → device preview → confirm → send → status.
Non-goals: on-device approval of dangerous ops; full diffs on device; complex GUI before basics;
bundling official logos.

## Hardware (verified — it is StickS3, not StickC Plus2; still confirm with test sketches)

ESP32-S3-PICO-1-N8R8 (8MB/8MB PSRAM); 1.14" 135x240 ST7789P3; 2 side buttons KEY1=GPIO11,
KEY2=GPIO12; power via M5PM1 PMIC (single=on/reset, double=off, long=download); BMI270 IMU @0x68;
MEMS mic + ES8311 codec + AW8737 amp + speaker; IR; 250mAh; Wi-Fi4 + BLE5; USB-C native USB.
Reflashing replaces UIFlow2 (reversible via M5Burner). Provide examples/button_test & audio_test; do
NOT hardcode unverified pins.

## Architecture & link

Device ↔ Mac bridge over Wi-Fi WebSocket: mDNS `_vibestick._tcp.local`, 6-digit pairing code →
bridge issues deviceId+token (NVS). Version negotiation in `hello`. Keys only on Mac (.env/Keychain),
never on device; bridge localhost/LAN only; redact secrets in logs; hooks send metadata/summaries,
not full diffs, unless opted in. USB serial for flash/logs/Wi-Fi fallback.

## Tech stack

- Firmware: PlatformIO + Arduino + M5Unified/M5GFX; I2S/ES8311 16kHz mono PCM16 chunked streaming;
  links2004/WebSockets; ArduinoJson; Preferences/NVS; captive portal for first-run Wi-Fi.
- Bridge: TypeScript/Node (pnpm monorepo). apps/{bridge,cli,tray?};
  packages/{protocol,audio,prompt-normalizer,status-store,integrations/{codex,claude,terminal,clipboard,mcp}};
  firmware/sticks3; assets/mascots; docs/; scripts/; examples/{mock-bridge,mock-agent,device-simulator}.

## STT (Chinese-first, local, pluggable) — VIBESTICK_STT_PROVIDER / VIBESTICK_STT_MODEL

Default Qwen3-ASR (open 0.6B/1.7B; strong 中英混; Apple-Silicon via MLX `mlx-qwen3-asr` or C
`antirez/qwen-asr`). Alternatives: MiMo-V2.5-ASR (Xiaomi), FunASR/SenseVoice (OpenAI-compatible
server), whisper.cpp (no-Python fallback). Opt-in cloud (off by default): OpenAI gpt-4o-transcribe,
Doubao/Volcengine. One interface transcribe(wav)->{text,lang} behind a localhost sidecar.

## Prompt normalizer

Pluggable backend (local Ollama Qwen2.5 default → deterministic fallback → Claude Haiku
claude-haiku-4-5 opt-in). Remove fillers; PRESERVE filenames/commands/identifiers/errors/paths/
numbers/constraints; never invent; support zh/en/mixed; detect target phrases (发给 Claude/Codex,
只复制, 继续/恢复上次, 重试, 查看状态); set needs_clarification + one question if ambiguous. Output
strict JSON (validate; repair/fallback on failure):

```
{ target:auto|claude|codex|clipboard|terminal, action:send|copy_only|save_draft|status_query|
  resume_last|cancel, clean_prompt, short_preview, detected_intent:implement|debug|refactor|review|
  explain|test|shell|status|other, risk_level:low|medium|high, needs_clarification:bool,
  clarification_question:string|null, should_auto_send:bool, spoken_commands:string[] }
```

Policy: never auto-submit to a terminal — paste only; the user presses Enter.

## UX state machine & controls (all mappings configurable)

States: idle/pairing/connected/recording/streaming/transcribing/draft_preview/sending/agent_running/
done/error. Primary(KEY1,"record",blue) / Secondary(KEY2) / Power(hardware).

- Idle: KEY1 short=task detail · hold=record · double=resume draft; KEY2 short=cycle target
  (Auto→Claude→Codex→Clipboard→Terminal) · hold=settings; shake=refresh; face-down=privacy mute;
  raise=wake.
- Recording: hold KEY1; release=transcribe; KEY2/shake=cancel; auto-stop ~60s.
- Draft preview (show target, summary, risk flags, hints): KEY1 short=Send(paste, NO Enter) ·
  hold=append voice edit · double=restore last sent; KEY2 short=cycle action(Send/Copy/Overlay/
  SaveDraft) · hold=cancel; tilt=scroll; shake=discard(confirm 1s).
- Agent running: show agent, repo, phase, mascot animation, Wi-Fi/battery/latency. If Mac approval/
  diff needed, device only says "check Mac"; no remote approve in MVP.

## Status pet (ORIGINAL mascots, NO official logos)

Codex=robot/owl, Claude=fox/capybara/bookworm; users may add custom assets. Sprites per state:
idle=sleep, recording=ears-up, transcribing=typing, running=tapping, needs_approval=raised-hand,
done=celebrate, failed=confused. Screen: top bar (Wi-Fi/battery/target/latency) / middle (pet+phase)
/ bottom (status+hints).

## WebSocket protocol (docs/protocol.md, packages/protocol)

Device→Bridge: hello{protocolVersion,deviceId,firmware}; button.event{button,gesture,ts};
audio.start{sessionId,sampleRate:16000,channels:1,format:pcm16}; <binary PCM>; audio.stop{sessionId,
durationMs}; draft.action{draftId,action}; heartbeat. Bridge→Device: state.update{state,task?};
draft.preview{draftId,target,shortPreview,riskLevel,needsClarification}; task.update{task};
error{code,message}; config. Heartbeat + reconnect + version negotiation.

## Unified task model (packages/status-store)

AgentKind=codex|claude|terminal|unknown; TaskStatus=idle|queued|running|needs_user_input|
needs_approval|completed|failed|cancelled; AgentPhase=planning|reading|editing|running_command|
running_tests|reviewing_diff|waiting|summarizing|unknown;
VibeTask{id,agent,projectName?,cwd?,status,phase,title,summary?,lastEventAt,startedAt,completedAt?,
riskLevel?,requiresMacAttention?,lastOutputPreview?,source:wrapper|hook|sdk|manual}. Device renders
only this.

## Integrations (layered)

L1 clipboard/terminal paste (Accessibility opt-in, never auto-Enter). L2 CLI wrappers
(`vibestick watch -- codex exec --json …`, `… claude -p …`) capture stream/JSON → task state. L3
hooks installer (`vibestick install-hooks --codex|--claude`, uninstall) — metadata only, removable.
L4 Codex SDK/app-server + local `vibestick-mcp` (get_device_status, notify_device,
get_last_voice_prompt, get_current_task_status, set_agent_phase) — skeleton in MVP.

## Power/standby/wake

Dim ~20s, backlight off ~60s (WS alive), raise/button/alert wake (+beep); deep sleep ~10min (Wi-Fi
off) wake on button + reconnect; battery%/charge from M5PM1.

## GitHub/OSS

main + feat branches; Conventional Commits; one-topic PRs. CI: typecheck, lint, unit tests, protocol
schema validation, normalizer fixtures, PlatformIO build. .env.example, SECURITY.md, CONTRIBUTING.md,
README. Releases: firmware .bin + ESP Web Tools flasher (Pages) + npm. Never commit
secrets/recordings.

## Do NOT

No keys on device; no default auto-approve; no full diffs on device; no official logos; no monolith;
no auto-Enter on injection; don't skip tests/docs.

## Start now (in this order)

1. State your understanding + MVP boundary.
2. Init repo/monorepo if absent.
3. Write docs/{product,architecture,ux,protocol,integrations,roadmap,troubleshooting}.md.
4. TS bridge/CLI skeleton.
5. protocol schema + mock device simulator.
6. firmware skeleton with TODO + hardware-verification checklist (no assumed pins).
7. run tests/build at each runnable node + suggest commits.

Get the main chain working first: hold-record → transcribe → normalize → preview → confirm → send →
status. Milestones: M0 Research&RFC → M1 bridge skeleton → M2 firmware skeleton → M3 voice MVP → M4
normalizer → M5 send adapters → M6 status display → M7 OSS polish (tag v0.1.0).
