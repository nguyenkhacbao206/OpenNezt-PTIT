"""Tạo file WAV lời nói THẬT để test pipeline (STT→NMT→TTS) mà không cần mic.

Dùng edge-tts (đã có sẵn, không cần key) đọc một câu công việc, rồi lưu thành
WAV PCM16 mono 16 kHz — đúng định dạng mà `tools/measure_latency.py` và
`tools/test_stream_client.py` mong đợi.

Cách dùng (từ backend/, đã bật venv):
    python tools/make_sample_wav.py                 # tạo mau_vi.wav + mau_en.wav
    python tools/make_sample_wav.py --text "..." --voice vi-VN-HoaiMyNeural --out x.wav
"""
from __future__ import annotations

import argparse
import asyncio
import io
import sys

import numpy as np
import soundfile as sf

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SAMPLE_RATE = 16000
DEFAULTS = [
    ("Chào anh, chúng ta bắt đầu cuộc họp về báo giá và tiến độ giao hàng trong quý này.",
     "vi-VN-HoaiMyNeural", "mau_vi.wav"),
    ("Hello, let's start the meeting about the quarterly revenue and the delivery timeline.",
     "en-US-AriaNeural", "mau_en.wav"),
]


async def synth_to_wav(text: str, voice: str, out: str) -> None:
    """edge-tts đọc `text` -> MP3 -> WAV PCM16 mono 16 kHz."""
    import edge_tts

    comm = edge_tts.Communicate(text, voice)
    mp3 = bytearray()
    async for chunk in comm.stream():
        if chunk.get("type") == "audio":
            mp3.extend(chunk.get("data", b""))
    if not mp3:
        raise RuntimeError(f"edge-tts không trả audio (voice={voice}). Kiểm tra mạng.")

    data, sr = sf.read(io.BytesIO(bytes(mp3)), dtype="float32")  # libsndfile đọc MP3
    if data.ndim > 1:
        data = data.mean(axis=1)
    if sr != SAMPLE_RATE:  # resample thô về 16 kHz
        idx = np.round(np.arange(0, len(data), sr / SAMPLE_RATE)).astype(int)
        idx = idx[idx < len(data)]
        data = data[idx]
    sf.write(out, data.astype("float32"), SAMPLE_RATE, subtype="PCM_16")
    print(f"✓ {out}  ({len(data) / SAMPLE_RATE:.1f}s, 16 kHz mono)  «{text[:48]}…»")


async def main_async(args) -> None:
    if args.text:
        await synth_to_wav(args.text, args.voice, args.out)
    else:
        for text, voice, out in DEFAULTS:
            await synth_to_wav(text, voice, out)


def main() -> None:
    p = argparse.ArgumentParser(description="Tạo WAV lời nói thật bằng edge-tts.")
    p.add_argument("--text", default=None, help="Câu cần đọc (mặc định: tạo cả mau_vi + mau_en).")
    p.add_argument("--voice", default="vi-VN-HoaiMyNeural", help="Giọng edge-tts.")
    p.add_argument("--out", default="mau.wav", help="File WAV đầu ra.")
    asyncio.run(main_async(p.parse_args()))


if __name__ == "__main__":
    main()
