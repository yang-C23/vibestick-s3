#!/usr/bin/env bash
# vibestick-s3: start the whole local stack — Ollama (normalizer LLM),
# the FunASR STT sidecar, and the vibestickd bridge. macOS / Apple Silicon.
#
#   ./scripts/start.sh
#
# Override paths/engines with env vars (see defaults below). The bridge auto-detects
# the StickS3 over USB serial and also listens on the LAN for Wi-Fi mode.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

OLLAMA_BIN="${OLLAMA_BIN:-$HOME/.vibestick/bin/ollama}"
STT_VENV="${STT_VENV:-$HOME/.vibestick/stt-venv}"

# 1. Ollama (prompt normalizer LLM)
if curl -s -m1 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "✓ ollama already running"
elif [ -x "$OLLAMA_BIN" ]; then
  echo "▶ starting ollama…"
  "$OLLAMA_BIN" serve >/tmp/vibestick-ollama.log 2>&1 &
else
  echo "! ollama not found at $OLLAMA_BIN — normalizer will fall back to the rule-based cleaner"
fi

# 2. FunASR SenseVoice STT sidecar
if curl -s -m1 http://127.0.0.1:47610/ >/dev/null 2>&1; then
  echo "✓ STT sidecar already running"
elif [ -x "$STT_VENV/bin/python" ]; then
  echo "▶ starting STT sidecar…"
  "$STT_VENV/bin/python" "$ROOT/packages/audio/sidecar/server.py" >/tmp/vibestick-stt.log 2>&1 &
else
  echo "! STT venv not found at $STT_VENV — set VIBESTICK_STT_PROVIDER=mock or install it (see docs/setup.md)"
fi

# 3. Bridge (foreground)
export VIBESTICK_BIND="${VIBESTICK_BIND:-0.0.0.0}"
export VIBESTICK_STT_PROVIDER="${VIBESTICK_STT_PROVIDER:-funasr}"
export VIBESTICK_STT_SIDECAR_URL="${VIBESTICK_STT_SIDECAR_URL:-http://127.0.0.1:47610}"
export VIBESTICK_NORMALIZER_BACKEND="${VIBESTICK_NORMALIZER_BACKEND:-ollama}"
export VIBESTICK_NORMALIZER_MODEL="${VIBESTICK_NORMALIZER_MODEL:-qwen3:4b}"
echo "▶ starting vibestickd (STT=$VIBESTICK_STT_PROVIDER, normalizer=$VIBESTICK_NORMALIZER_BACKEND/$VIBESTICK_NORMALIZER_MODEL)…"
exec pnpm --dir "$ROOT" --filter vibestickd dev
