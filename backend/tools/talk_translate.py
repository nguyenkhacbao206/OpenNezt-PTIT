"""Speak Vietnamese, get an English transcript — end-to-end cloud test.

Records mic audio, sends it over the WebSocket to a server running in `cloud`
mode (Gemini STT + NMT), and prints the Vietnamese transcript plus its English
translation. Audio stays in RAM (no disk write).

Prereqs:
    1) A Google AI Studio key in .env as STT_API_KEY and NMT_API_KEY (same value).
    2) Server running:  uvicorn app.main:app --reload

Usage (from backend/):
    python tools/talk_translate.py                 # press Enter to start/stop
    python tools/talk_translate.py --seconds 6     # fixed 6-second capture
    python tools/talk_translate.py --src vi --tgt en
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import io
import json
import queue
import sys
import threading

import numpy as np
import sounddevice as sd
import soundfile as sf
import websockets

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # Vietnamese on Windows consoles

WS_URL = "ws://localhost:8000/ws"
SAMPLE_RATE = 16000


def record_fixed(seconds: float) -> np.ndarray:
    """Record `seconds` of mono 16 kHz audio and return a float32 array."""
    print(f"● Recording for {seconds:.0f}s... speak Vietnamese now.")
    frames = sd.rec(
        int(seconds * SAMPLE_RATE), samplerate=SAMPLE_RATE, channels=1, dtype="float32"
    )
    sd.wait()
    print("■ Done recording.")
    return frames.reshape(-1)


def record_until_enter() -> np.ndarray:
    """Record until the user presses Enter; return a float32 mono array."""
    input("Press Enter to START recording...")
    chunks: "queue.Queue[np.ndarray]" = queue.Queue()

    def callback(indata, _frames, _time, status) -> None:
        if status:
            print(f"(audio status: {status})", file=sys.stderr)
        chunks.put(indata.copy())

    stop = threading.Event()

    def wait_for_enter() -> None:
        input("● Recording... press Enter to STOP.\n")
        stop.set()

    threading.Thread(target=wait_for_enter, daemon=True).start()
    with sd.InputStream(
        samplerate=SAMPLE_RATE, channels=1, dtype="float32", callback=callback
    ):
        while not stop.is_set():
            sd.sleep(100)

    print("■ Done recording.")
    collected = []
    while not chunks.empty():
        collected.append(chunks.get())
    if not collected:
        return np.zeros(0, dtype="float32")
    return np.concatenate(collected).reshape(-1)


def to_wav_bytes(audio: np.ndarray, sample_rate: int = SAMPLE_RATE) -> bytes:
    """Encode a float32 mono array as 16-bit PCM WAV bytes (in RAM)."""
    buf = io.BytesIO()
    sf.write(buf, audio, sample_rate, format="WAV", subtype="PCM_16")
    return buf.getvalue()


async def run_turn(audio_b64: str, src: str, tgt: str) -> None:
    """Send one push-to-talk turn and print the transcript + translation."""
    async with websockets.connect(WS_URL) as ws:
        await ws.send(json.dumps(
            {"type": "session.start",
             "data": {"mode": "cloud", "sourceLang": src, "targetLang": tgt}}
        ))
        await ws.send(json.dumps(
            {"type": "audio.chunk", "data": {"speaker": "A", "audio": audio_b64}}
        ))

        # Read events until we see nmt.result (success) or error, then stop.
        got_result = False
        for _ in range(8):
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=45.0)
            except asyncio.TimeoutError:
                print("⚠ Timed out waiting for the server. Is it running in cloud mode with a key?")
                break
            msg = json.loads(raw)
            etype, edata = msg.get("type"), msg.get("data", {})
            if etype == "stt.final":
                print(f"\n🎙  Tiếng Việt (STT): {edata.get('text')}")
            elif etype == "nmt.result":
                print(f"🌐  English (NMT):    {edata.get('dstText')}")
                got_result = True
                break
            elif etype == "error":
                print(f"\n❌ error [{edata.get('code')}]: {edata.get('message')}")
                break

        await ws.send(json.dumps({"type": "session.end", "data": {}}))
        if got_result:
            print("\n✅ End-to-end vi→en worked.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Speak Vietnamese -> English transcript (cloud/Gemini).")
    parser.add_argument("--seconds", type=float, default=None,
                        help="Record a fixed number of seconds (default: Enter to start/stop).")
    parser.add_argument("--src", default="vi", help="Source language (default: vi).")
    parser.add_argument("--tgt", default="en", help="Target language (default: en).")
    args = parser.parse_args()

    audio = record_fixed(args.seconds) if args.seconds else record_until_enter()
    if len(audio) / SAMPLE_RATE < 0.2:
        print("No/almost no audio captured. Check your microphone and try again.")
        return

    audio_b64 = base64.b64encode(to_wav_bytes(audio)).decode("ascii")
    asyncio.run(run_turn(audio_b64, args.src, args.tgt))


if __name__ == "__main__":
    main()
