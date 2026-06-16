# Integrations — voice pipeline, STT, normalizer, adapters

## Voice → prompt pipeline

`audio.start` → binary PCM → `audio.stop` → bridge writes temp WAV → **STT** → raw transcript →
**prompt-normalizer** → `draft.preview` → confirm/edit/cancel → adapter send → `status-store`
creates a `VibeTask` → device enters agent-running.

## STT providers (Chinese-first, local, pluggable)

Config: `VIBESTICK_STT_PROVIDER`, `VIBESTICK_STT_MODEL`, `VIBESTICK_STT_SIDECAR_URL`. One interface:
`transcribe(wav) → { text, lang }`. Engines run as a localhost sidecar.

| Provider | Notes |
| --- | --- |
| **`qwen3-asr`** (default) | Alibaba open 0.6B/1.7B; SOTA open, strong 中英混. Apple-Silicon via **MLX** (`mlx-qwen3-asr`) or **C inference** (`antirez/qwen-asr`). |
| `mimo` | Xiaomi **MiMo-V2.5-ASR** — Mandarin + English + dialects + code-switch. |
| `funasr` | Alibaba FunASR / SenseVoice; 170× realtime; ships an **OpenAI-compatible** server (trivial to call). |
| `whispercpp` | Zero-Python single-binary fallback (`whisper-cli`, large-v3). |
| `openai` / `doubao` | **Opt-in cloud** (off by default): OpenAI `gpt-4o-transcribe`, ByteDance Volcengine. |
| `mock` | Canned transcript for tests/dev. |

## Prompt normalizer

Config: `VIBESTICK_NORMALIZER_BACKEND` = `ollama` (default) → `deterministic` (zero-dep fallback) →
`claude` (opt-in, `claude-haiku-4-5`, needs `ANTHROPIC_API_KEY`). Output is strict JSON validated
against `normalizer-result.schema.json`; on invalid → repair/retry → deterministic clean + raw.

Rules: remove fillers (嗯/然后/就是/um/like); **preserve** filenames, commands, package names,
identifiers, error messages, paths, numbers, constraints; never invent requirements; convert vague
speech to a clear engineering instruction; support zh / en / mixed; detect target phrases
(发给 Claude/Codex, 只复制, 不要发送, 继续/恢复上次, 重试, 查看状态); set `needs_clarification` + one
question if ambiguous. **`should_auto_send` never auto-submits to a terminal** — paste only; the user
presses Enter.

## Integration layers (don't bind to one TUI)

- **L1 Clipboard / terminal (default):** clipboard always; with Accessibility opt-in, `osascript`
  Cmd+V into the frontmost Terminal/iTerm/VS Code — **never** auto-Enter.
- **L2 CLI wrappers:** `vibestick watch -- codex exec --json …` / `… claude -p …` mint a task id,
  capture stream/JSON, update the status-store, push status to the device. Robust even without hooks.
- **L3 Hooks:** `vibestick install-hooks --codex|--claude` / `uninstall-hooks`. Push lifecycle events
  (session start, prompt submit, tool start/end, command, permission request, notification,
  stop/done/fail). Metadata/summaries only by default; minimal-permission, auditable, removable.
- **L4 SDK / app-server / MCP (later):** Codex SDK/app-server adapters; local `vibestick-mcp`
  (`get_device_status`, `notify_device`, `get_last_voice_prompt`, `get_current_task_status`,
  `set_agent_phase`).

## Unified task model

Every adapter normalizes into a `VibeTask` (`packages/protocol/src/task.ts`): `AgentKind`,
`TaskStatus`, `AgentPhase`, plus title/summary/cwd/risk/requiresMacAttention/source. The device
renders only this — never raw logs.
