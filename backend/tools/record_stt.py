"""Record from the microphone, run real STT (Faster-Whisper), write Markdown.

This is a standalone test tool for the audio-capture + STT path — no server or
frontend needed. Speak, and your words are transcribed to a .md file.

Usage (from the `backend/` folder):
    # Interactive: press Enter to start, Enter again to stop
    python tools/record_stt.py

    # Fixed duration (seconds)
    python tools/record_stt.py --seconds 8

    # Force a language and pick a model / output path
    python tools/record_stt.py --lang vi --model small --out transcripts/meeting.md

Notes:
    * Audio stays in RAM and is fed straight to Whisper as a numpy array —
      no audio file is written to disk (matches the project's zero-retention goal).
    * First run downloads the Whisper model (cached afterwards).
"""
from __future__ import annotations

import argparse
import queue
import sys
import threading
from datetime import datetime
from pathlib import Path

import numpy as np
import sounddevice as sd

# Allow importing the shared engine whether run from backend/ or elsewhere.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.providers.whisper_engine import SAMPLE_RATE, Transcription, get_engine  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # print Vietnamese on Windows consoles


def record_fixed(seconds: float) -> np.ndarray:
    """Record `seconds` of mono 16 kHz audio and return a float32 array."""
    print(f"● Recording for {seconds:.0f}s... speak now.")
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


def to_markdown(result: Transcription, model_label: str, duration_s: float) -> str:
    """Render the transcription as a Markdown document."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = [
        "# STT Transcript",
        "",
        f"- **Time:** {now}",
        f"- **Language (detected/forced):** `{result.language}`",
        f"- **Model:** `{model_label}`",
        f"- **Audio duration:** {duration_s:.1f}s",
        "",
        "## Text",
        "",
        result.text or "_(no speech detected)_",
        "",
        "## Segments",
        "",
        "| # | Start | End | Text |",
        "|---|-------|-----|------|",
    ]
    for i, seg in enumerate(result.segments, start=1):
        text = seg.text.replace("|", "\\|")
        lines.append(f"| {i} | {seg.start:.2f}s | {seg.end:.2f}s | {text} |")
    if not result.segments:
        lines.append("| - | - | - | _(none)_ |")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    """Parse args, record, transcribe, and write the Markdown transcript."""
    parser = argparse.ArgumentParser(description="Record mic audio and STT to Markdown.")
    parser.add_argument("--seconds", type=float, default=None,
                        help="Record a fixed number of seconds (default: press Enter to stop).")
    parser.add_argument("--wav", default=None,
                        help="Transcribe an existing audio file instead of the mic (any format).")
    parser.add_argument("--lang", default="auto", help="vi | en | auto (default: auto).")
    parser.add_argument("--engine", default="whisper", choices=["whisper", "sherpa"],
                        help="STT engine: whisper (multilingual) | sherpa (gipformer VI / zipformer EN).")
    parser.add_argument("--models-dir", default="models",
                        help="sherpa: root folder with per-language model subfolders (default: models).")
    parser.add_argument("--model", default="small",
                        help="Whisper model: tiny|base|small|medium (default: small).")
    parser.add_argument("--out", default=None,
                        help="Output .md path (default: transcripts/transcript-<timestamp>.md).")
    args = parser.parse_args()

    # 1) Capture audio (kept in RAM only), or load an existing file.
    if args.wav:
        from faster_whisper.audio import decode_audio  # decodes+resamples to 16k
        print(f"Loading audio file: {args.wav}")
        audio = decode_audio(args.wav, sampling_rate=SAMPLE_RATE)
    elif args.seconds:
        audio = record_fixed(args.seconds)
    else:
        audio = record_until_enter()

    duration_s = len(audio) / SAMPLE_RATE
    if duration_s < 0.2:
        print("No/almost no audio captured. Check your microphone and try again.")
        return

    # 2) Transcribe with the chosen engine.
    if args.engine == "sherpa":
        if args.lang in (None, "", "auto"):
            print("sherpa needs an explicit --lang (e.g. --lang vi or --lang en).")
            return
        print(f"Transcribing {duration_s:.1f}s with sherpa-onnx ({args.lang}) from '{args.models_dir}'...")
        from app.providers.sherpa_engine import get_sherpa_engine

        sherpa = get_sherpa_engine(models_dir=args.models_dir)
        st = sherpa.transcribe_array(audio, language=args.lang, sample_rate=SAMPLE_RATE)
        # sherpa returns plain text (no segments) — adapt to the Markdown renderer.
        result = Transcription(text=st.text, language=st.language, segments=[])
        model_label = f"sherpa-onnx ({st.language})"
    else:
        print(f"Transcribing {duration_s:.1f}s of audio with Whisper model '{args.model}'...")
        engine = get_engine(model_size=args.model)
        result = engine.transcribe_array(audio, language=args.lang)
        model_label = f"faster-whisper {args.model}"

    # 3) Write Markdown.
    if args.out:
        out_path = Path(args.out)
    else:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        out_path = Path("transcripts") / f"transcript-{stamp}.md"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(to_markdown(result, model_label, duration_s), encoding="utf-8")

    print("\n--- Transcript ---")
    print(result.text or "(no speech detected)")
    print(f"\nSaved Markdown -> {out_path.resolve()}")


if __name__ == "__main__":
    main()
