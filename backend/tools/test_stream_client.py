"""Test client cho dịch STREAMING (dự đoán -> chốt) qua WebSocket.

Mô phỏng "đang nói" bằng cách cắt một file WAV thành các cửa sổ lớn dần, gửi
từng cửa sổ dưới dạng `audio.partial` (nhận bản dịch dự đoán), rồi gửi cả câu
dưới dạng `audio.chunk` (bản chốt). In ra để so sánh bản dự đoán vs bản chốt.

Cần một server đang chạy:  uvicorn app.main:app --reload

Cách dùng (từ backend/):
    python tools/test_stream_client.py --wav path\\to\\file.wav
    python tools/test_stream_client.py --wav file.wav --src en --tgt vi --windows 4
    python tools/test_stream_client.py            # không có --wav: thu 5s từ mic
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import io
import sys

import numpy as np
import soundfile as sf
import websockets

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

WS_URL = "ws://localhost:8000/ws"
SAMPLE_RATE = 16000


def load_or_record(wav: str | None, seconds: float) -> np.ndarray:
    """Đọc WAV (mono, resample thô về 16k) hoặc thu từ mic."""
    if wav:
        data, sr = sf.read(wav, dtype="float32")
        if data.ndim > 1:
            data = data.mean(axis=1)
        if sr != SAMPLE_RATE:  # resample thô cho mục đích test
            idx = np.round(np.arange(0, len(data), sr / SAMPLE_RATE)).astype(int)
            idx = idx[idx < len(data)]
            data = data[idx]
        return data.astype("float32")
    import sounddevice as sd

    print(f"● Thu {seconds:.0f}s từ mic... nói ngay bây giờ.")
    frames = sd.rec(int(seconds * SAMPLE_RATE), samplerate=SAMPLE_RATE, channels=1, dtype="float32")
    sd.wait()
    print("■ Xong thu.")
    return frames.reshape(-1)


def to_wav_b64(audio: np.ndarray) -> str:
    """float32 mono -> WAV PCM16 -> base64."""
    buf = io.BytesIO()
    sf.write(buf, audio, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    return base64.b64encode(buf.getvalue()).decode("ascii")


async def drain(ws, stop_on: set[str]) -> None:
    """In các event tới khi gặp một type trong stop_on (hoặc timeout)."""
    while True:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=45.0)
        except asyncio.TimeoutError:
            print("⚠ timeout chờ server.")
            return
        import json

        msg = json.loads(raw)
        t, d = msg.get("type"), msg.get("data", {})
        if t == "nmt.partial":
            print(f"   ⏳ DỰ ĐOÁN : {d.get('dstText')}")
        elif t == "nmt.result":
            print(f"   ✅ CHỐT    : {d.get('dstText')}")
        elif t == "error":
            print(f"   ❌ error [{d.get('code')}]: {d.get('message')}")
        if t in stop_on:
            return


async def run(audio: np.ndarray, src: str, tgt: str, windows: int, speaker: str) -> None:
    import json

    async with websockets.connect(WS_URL) as ws:
        await ws.send(json.dumps({
            "type": "session.start",
            "data": {"mode": "cloud", "sourceLang": src, "targetLang": tgt},
        }))
        # Các cửa sổ lớn dần -> mô phỏng đang nói.
        total = len(audio)
        for i in range(1, windows + 1):
            end = max(1, int(total * i / (windows + 1)))
            print(f"[cửa sổ {i}/{windows}]  ({end / SAMPLE_RATE:.1f}s)")
            await ws.send(json.dumps({
                "type": "audio.partial",
                "data": {"speaker": speaker, "audio": to_wav_b64(audio[:end])},
            }))
            await drain(ws, stop_on={"nmt.partial", "error"})
            await asyncio.sleep(0.2)
        # Chốt cả câu.
        print("[CHỐT câu]")
        await ws.send(json.dumps({
            "type": "audio.chunk",
            "data": {"speaker": speaker, "audio": to_wav_b64(audio)},
        }))
        await drain(ws, stop_on={"nmt.result", "error"})
        await ws.send(json.dumps({"type": "session.end", "data": {}}))


def main() -> None:
    p = argparse.ArgumentParser(description="Test dịch streaming qua WebSocket.")
    p.add_argument("--wav", default=None, help="File WAV nguồn (không có -> thu mic 5s).")
    p.add_argument("--src", default="vi", help="Ngôn ngữ nguồn (mặc định vi).")
    p.add_argument("--tgt", default="en", help="Ngôn ngữ đích (mặc định en).")
    p.add_argument("--windows", type=int, default=3, help="Số cửa sổ dự đoán (mặc định 3).")
    p.add_argument("--speaker", default="vn", help="vn | sg (mặc định vn).")
    args = p.parse_args()

    audio = load_or_record(args.wav, seconds=5.0)
    if len(audio) / SAMPLE_RATE < 0.2:
        print("Gần như không có âm thanh. Kiểm tra mic/WAV.")
        return
    asyncio.run(run(audio, args.src, args.tgt, max(1, args.windows), args.speaker))


if __name__ == "__main__":
    main()
