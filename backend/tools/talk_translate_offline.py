"""Nói tiếng Việt -> transcript tiếng Anh, CHẠY HOÀN TOÀN OFFLINE.

Không cần server, không cần key/quota Gemini. Thu micro rồi dùng Faster-Whisper
ngay tại máy để:
  1) transcribe -> câu tiếng Việt (đúng lời bạn nói)
  2) translate  -> bản dịch tiếng Anh (task="translate" có sẵn của Whisper)

Model Whisper tự tải lần đầu (cache ~/.cache/huggingface) rồi dùng lại. Âm thanh
chỉ nằm trong RAM, không ghi ra ổ đĩa.

Cách dùng (từ backend/, đã activate .venv):
    python tools/talk_translate_offline.py                  # Enter để bắt đầu/kết thúc
    python tools/talk_translate_offline.py --seconds 6      # thu cố định 6 giây
    python tools/talk_translate_offline.py --model medium   # chính xác hơn, chậm hơn
    python tools/talk_translate_offline.py --src auto        # tự nhận ngôn ngữ nguồn
"""
from __future__ import annotations

import argparse
import queue
import sys
import threading

import numpy as np
import sounddevice as sd

# Chạy được khi gọi từ backend/ (import gói app.*)
sys.path.insert(0, __file__.rsplit("tools", 1)[0])

from app.providers.whisper_engine import get_engine  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # tiếng Việt trên console Windows

SAMPLE_RATE = 16000


def record_fixed(seconds: float) -> np.ndarray:
    """Thu `seconds` giây audio mono 16 kHz, trả về mảng float32."""
    print(f"● Đang thu {seconds:.0f}s... nói tiếng Việt ngay bây giờ.")
    frames = sd.rec(
        int(seconds * SAMPLE_RATE), samplerate=SAMPLE_RATE, channels=1, dtype="float32"
    )
    sd.wait()
    print("■ Xong.")
    return frames.reshape(-1)


def record_until_enter() -> np.ndarray:
    """Thu tới khi nhấn Enter; trả về mảng float32 mono."""
    input("Nhấn Enter để BẮT ĐẦU thu...")
    chunks: "queue.Queue[np.ndarray]" = queue.Queue()

    def callback(indata, _frames, _time, status) -> None:
        if status:
            print(f"(audio status: {status})", file=sys.stderr)
        chunks.put(indata.copy())

    stop = threading.Event()

    def wait_for_enter() -> None:
        input("● Đang thu... nhấn Enter để DỪNG.\n")
        stop.set()

    threading.Thread(target=wait_for_enter, daemon=True).start()
    with sd.InputStream(
        samplerate=SAMPLE_RATE, channels=1, dtype="float32", callback=callback
    ):
        while not stop.is_set():
            sd.sleep(100)

    print("■ Xong.")
    collected = []
    while not chunks.empty():
        collected.append(chunks.get())
    if not collected:
        return np.zeros(0, dtype="float32")
    return np.concatenate(collected).reshape(-1)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Nói tiếng Việt -> transcript tiếng Anh (offline, Whisper)."
    )
    parser.add_argument("--seconds", type=float, default=None,
                        help="Thu cố định số giây (mặc định: Enter để bắt đầu/dừng).")
    parser.add_argument("--src", default="vi",
                        help='Ngôn ngữ nguồn: "vi" (mặc định) hoặc "auto".')
    parser.add_argument("--model", default="small",
                        help="Kích thước model Whisper: tiny|base|small|medium (mặc định: small).")
    args = parser.parse_args()

    audio = record_fixed(args.seconds) if args.seconds else record_until_enter()
    if len(audio) / SAMPLE_RATE < 0.2:
        print("Gần như không thu được âm thanh. Kiểm tra micro rồi thử lại.")
        return

    print("\n… Đang nạp model Whisper (lần đầu sẽ tải về, chờ chút)…")
    engine = get_engine(model_size=args.model)

    # 1) Transcript tiếng Việt (đúng lời nói)
    vi = engine.transcribe_array(audio, language=args.src, task="transcribe")
    # 2) Bản dịch tiếng Anh (task=translate: bất kỳ ngôn ngữ -> English)
    en = engine.transcribe_array(audio, language=args.src, task="translate")

    print(f"\n🎙  Tiếng Việt (STT): {vi.text}")
    print(f"🌐  English (dịch):   {en.text}")
    print("\n✅ Xong — chạy hoàn toàn offline, không dùng Gemini.")


if __name__ == "__main__":
    main()
