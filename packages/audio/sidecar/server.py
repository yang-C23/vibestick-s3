#!/usr/bin/env python3
"""Local STT sidecar for vibestick-s3 (Chinese-first, offline).

Contract (matches packages/audio SidecarProvider):
    POST /transcribe   body = raw WAV bytes   ->   {"text": "...", "lang": "..."}

Default engine: FunASR SenseVoiceSmall (excellent zh/en, very fast).
Swap MODEL_ID for Qwen3-ASR / MiMo-V2.5-ASR, or run them via MLX / the C
`qwen-asr` binary and shell out instead (see README.md).

Run:  pip install -r requirements.txt && python server.py    # listens on :47610
"""
import json
import os
import re
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("VIBESTICK_STT_SIDECAR_PORT", "47610"))
MODEL_ID = os.environ.get("VIBESTICK_STT_MODEL", "iic/SenseVoiceSmall")

_model = None


def get_model():
    global _model
    if _model is None:
        from funasr import AutoModel  # lazy import so --help etc. is cheap

        _model = AutoModel(model=MODEL_ID, disable_update=True)
    return _model


_TAG = re.compile(r"<\|[^|]*\|>")


def transcribe(wav_bytes: bytes) -> dict:
    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        f.write(wav_bytes)
        f.flush()
        res = get_model().generate(input=f.name, language="auto", use_itn=True)
    text = res[0]["text"] if res else ""
    return {"text": _TAG.sub("", text).strip(), "lang": "auto"}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802
        if self.path != "/transcribe":
            self.send_response(404)
            self.end_headers()
            return
        n = int(self.headers.get("content-length", 0))
        body = self.rfile.read(n)
        try:
            payload = json.dumps(transcribe(body)).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as exc:  # noqa: BLE001
            self.send_response(500)
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(exc)}).encode())

    def log_message(self, *_args):  # silence default logging
        pass


if __name__ == "__main__":
    print(f"vibestick STT sidecar ({MODEL_ID}) on http://127.0.0.1:{PORT} (POST /transcribe)")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
