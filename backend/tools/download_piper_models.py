"""Download the per-language Piper voice models used by OfflineTTSProvider.

Fetches into <models_dir>/<lang>/ so PiperEngine's auto-discovery finds the
(.onnx, .onnx.json) pair:

    Vietnamese (vi) -> vi_VN-vais1000-medium
    English    (en) -> en_US-lessac-medium

Downloading is delegated to piper's own `piper.download_voices` (from the
`piper-tts` package), which pulls the files from the rhasspy/piper-voices Hub.

Usage (from the `backend/` folder):
    python tools/download_piper_models.py                 # both vi + en
    python tools/download_piper_models.py --langs vi      # just Vietnamese
    python tools/download_piper_models.py --models-dir models/tts
    python tools/download_piper_models.py --vi-voice vi_VN-25hours_single-low

After it finishes, set in .env:
    TTS_ENGINE=piper
    PIPER_MODELS_DIR=models/tts
and (re)start the server — a session in any mode gets Piper voices.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

# Default voice per language (name as understood by `piper.download_voices`).
# Other options: vi -> vi_VN-25hours_single-low / vi_VN-vivos-x_low;
#                en -> en_US-amy-medium / en_US-ryan-high / en_US-lessac-high.
DEFAULT_VOICES = {
    "vi": "vi_VN-vais1000-medium",
    "en": "en_US-lessac-medium",
}


def _download(voice: str, dest: Path, force: bool) -> None:
    """Run piper.download_voices for one voice into `dest` (created if missing)."""
    dest.mkdir(parents=True, exist_ok=True)
    cmd = [
        sys.executable, "-m", "piper.download_voices",
        "--download-dir", str(dest), voice,
    ]
    if force:
        cmd.append("--force-redownload")
    print(f"[piper] downloading {voice} -> {dest}")
    subprocess.run(cmd, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Download Piper voices per language.")
    parser.add_argument(
        "--models-dir", default="models/tts",
        help="Root folder; each voice lands in <models-dir>/<lang>/ (default: models/tts).",
    )
    parser.add_argument(
        "--langs", nargs="+", default=["vi", "en"], choices=["vi", "en"],
        help="Languages to fetch (default: vi en).",
    )
    parser.add_argument("--vi-voice", default=DEFAULT_VOICES["vi"], help="Override the VI voice name.")
    parser.add_argument("--en-voice", default=DEFAULT_VOICES["en"], help="Override the EN voice name.")
    parser.add_argument("--force-redownload", action="store_true", help="Re-download even if present.")
    args = parser.parse_args()

    voices = {"vi": args.vi_voice, "en": args.en_voice}
    root = Path(args.models_dir)
    try:
        import piper.download_voices  # noqa: F401  (fail fast if piper-tts is missing)
    except ImportError:
        print("piper-tts is not installed. Run: pip install piper-tts>=1.3", file=sys.stderr)
        return 1

    for lang in args.langs:
        _download(voices[lang], root / lang, args.force_redownload)

    print(f"\nDone. Set TTS_ENGINE=piper and PIPER_MODELS_DIR={root} in .env, then restart.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
