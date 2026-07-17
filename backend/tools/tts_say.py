"""Synthesize text with the Piper TTS engine and save a WAV you can play.

Quick way to hear exactly what the pipeline speaks — same engine, same
normalization and punctuation-pause handling as the live server, no WebSocket
needed.

Usage (from the `backend/` folder):
    python tools/tts_say.py --lang en --text "Hello, this is a test. Second one!"
    python tools/tts_say.py --lang vi --text "Xin chào, chúng ta bắt đầu họp."
    python tools/tts_say.py --lang vi --file transcript.txt --out out.wav
    python tools/tts_say.py --demo            # write demo_en.wav + demo_vi.wav

Options: --length-scale 1.15 (slower) reads more deliberately.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running as `python tools/tts_say.py` from the backend/ folder.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.providers.piper_engine import get_piper_engine  # noqa: E402

_DEMO = {
    "en": "Hello, let's start the meeting about this quarter's revenue. "
    "Sales grew strongly; profit is up as well!",
    "vi": "Xin chào, chúng ta bắt đầu cuộc họp về doanh thu quý này. "
    "Doanh số tăng mạnh; lợi nhuận cũng đi lên!",
}


def say(text: str, lang: str, out: Path, models_dir: str, length_scale: float) -> None:
    """Synthesize `text` in `lang` and write a WAV to `out`."""
    engine = get_piper_engine(models_dir=models_dir, length_scale=length_scale)
    wav = engine.synthesize(text, lang)
    out.write_bytes(wav)
    secs = round((len(wav) - 44) / 2 / 22050, 2)
    print(f"[{lang}] {secs}s -> {out}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Speak text with Piper and save a WAV.")
    parser.add_argument("--lang", default="en", help="Voice language: vi | en (default en).")
    parser.add_argument("--text", help="Text to speak.")
    parser.add_argument("--file", help="Read text from a UTF-8 file instead of --text.")
    parser.add_argument("--out", default="tts_out.wav", help="Output WAV path (default tts_out.wav).")
    parser.add_argument("--models-dir", default="models/tts", help="Piper voices root.")
    parser.add_argument("--length-scale", type=float, default=1.0, help=">1 slower, <1 faster.")
    parser.add_argument("--demo", action="store_true", help="Write demo_en.wav + demo_vi.wav.")
    args = parser.parse_args()

    if args.demo:
        for lang, text in _DEMO.items():
            say(text, lang, Path(f"demo_{lang}.wav"), args.models_dir, args.length_scale)
        return

    text = args.text
    if args.file:
        text = Path(args.file).read_text(encoding="utf-8")
    if not text:
        sys.exit("Provide --text, --file, or --demo.")
    say(text, args.lang, Path(args.out), args.models_dir, args.length_scale)


if __name__ == "__main__":
    main()
