# STT sidecar (local, Chinese-first)

A tiny HTTP server the bridge calls for transcription. Contract:

```
POST /transcribe   body = raw WAV bytes   ->   {"text": "...", "lang": "..."}
```

Point the bridge at it with `VIBESTICK_STT_PROVIDER=qwen3-asr` (or `funasr`/`mimo`/`sidecar`) and
`VIBESTICK_STT_SIDECAR_URL=http://127.0.0.1:47610`.

## Default: FunASR SenseVoiceSmall

```sh
cd packages/audio/sidecar
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python server.py            # http://127.0.0.1:47610
```

Excellent zh/en/yue/ja/ko, very fast (non-autoregressive). First run downloads the model.

## Alternatives (swap the engine, keep the contract)

- **Qwen3-ASR** (recommended for 中英混, SOTA open): run via Apple-Silicon **MLX**
  (`pip install mlx-qwen3-asr`) or the lightweight **C** binary
  ([`antirez/qwen-asr`](https://github.com/antirez/qwen-asr)); wrap either in the same `/transcribe`
  endpoint (shell out to the binary, or call the MLX model in `transcribe()`).
- **MiMo-V2.5-ASR** (Xiaomi): strong Mandarin + English + dialects + code-switch; set
  `VIBESTICK_STT_MODEL` and load it in `get_model()`.
- **Cloud (opt-in, off by default):** set `VIBESTICK_STT_PROVIDER=openai` or `doubao` in the bridge
  instead of running a sidecar (keys stay in the bridge `.env`).

No hardware or cloud is needed for development — the bridge defaults to `VIBESTICK_STT_PROVIDER=mock`.
