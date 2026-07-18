"""Entry point cho backend đóng gói (PyInstaller) — chạy offline, tự tìm model.

Khi chạy dưới dạng exe (frozen), model được ship trong thư mục `models/` NẰM CẠNH
exe. Script này set sẵn các biến môi trường trỏ tới đó (nếu chưa có), rồi chạy
uvicorn — nên app không cần `.env` và không tải gì từ mạng.

Layout khi đóng gói:
    <exe_dir>/
        opennezt-backend.exe
        models/
            nllb-200-distilled-600M-ct2-int8/   (NMT)
            whisper-small/                       (STT, CT2 faster-whisper)
            tts/vi , tts/en                      (Piper voices)
"""
from __future__ import annotations

import argparse
import os
import sys


def _base_dir() -> str:
    """Thư mục chứa exe (frozen) hoặc thư mục backend (dev)."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def _apply_offline_defaults() -> None:
    """Set mặc định offline + đường dẫn model cạnh exe (chỉ khi đóng gói frozen).

    Ở chế độ dev (chạy bằng python) thì bỏ qua để `.env` điều khiển như thường.
    """
    if not getattr(sys, "frozen", False):
        return
    models = os.path.join(_base_dir(), "models")
    defaults = {
        "DEFAULT_MODE": "offline",
        "STT_ENGINE": "whisper",
        "TTS_ENGINE": "piper",
        "OFFLINE_NMT_MODEL_DIR": os.path.join(models, "nllb-200-distilled-600M-ct2-int8"),
        "OFFLINE_STT_MODEL_DIR": os.path.join(models, "whisper-small"),
        "PIPER_MODELS_DIR": os.path.join(models, "tts"),
    }
    for key, value in defaults.items():
        os.environ.setdefault(key, value)


def main() -> None:
    ap = argparse.ArgumentParser(description="OpenNezt backend (offline, self-contained).")
    ap.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")))
    args = ap.parse_args()

    # Set env TRƯỚC khi import app (config đọc env lúc import).
    _apply_offline_defaults()

    import uvicorn

    from app.main import app  # import sau khi env đã sẵn

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
