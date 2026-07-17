"""Download the per-language Piper TTS voices used by OfflineTTSProvider.

Fetches a voice pair (`.onnx` + `.onnx.json`) into <models_dir>/<lang>/ so the
engine's auto-discovery finds them:

    Vietnamese (vi) -> vi_VN-vais1000-medium   (rhasspy/piper-voices)
    English    (en) -> en_US-lessac-medium     (rhasspy/piper-voices)

Usage (from the `backend/` folder):
    python tools/download_piper_models.py               # both vi + en
    python tools/download_piper_models.py --langs vi    # just Vietnamese
    python tools/download_piper_models.py --models-dir models/tts

After it finishes, set in .env (default is already "piper"):
    TTS_ENGINE=piper
and run the server. TTS works in cloud OR offline mode.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Piper voices live on the HuggingFace Hub under rhasspy/piper-voices.
# Each voice is a `<name>.onnx` model plus a `<name>.onnx.json` config.
PIPER_HF_REPO = "rhasspy/piper-voices"

# lang code -> (voice name, repo path prefix). The two files fetched are
# "<prefix>/<name>.onnx" and "<prefix>/<name>.onnx.json".
VOICES: dict[str, tuple[str, str]] = {
    "vi": ("vi_VN-vais1000-medium", "vi/vi_VN/vais1000/medium"),
    "en": ("en_US-lessac-medium", "en/en_US/lessac/medium"),
}


def _has_voice(dest: Path) -> bool:
    """True if dest already contains a voice .onnx + its .onnx.json config."""
    onnx = [f for f in dest.rglob("*.onnx") if not f.name.endswith(".onnx.json")]
    return bool(onnx) and any(dest.rglob("*.onnx.json"))


def download_voice(lang: str, dest: Path) -> None:
    """Download one Piper voice pair into dest via huggingface_hub."""
    spec = VOICES.get(lang)
    if spec is None:
        print(
            f"[{lang}] no known Piper voice — browse https://huggingface.co/{PIPER_HF_REPO} "
            f"and drop <name>.onnx + <name>.onnx.json into {dest}/ manually."
        )
        return
    if _has_voice(dest):
        print(f"[{lang}] already present in {dest} — skipping.")
        return

    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        sys.exit("huggingface_hub not installed. Run: pip install huggingface_hub")

    name, prefix = spec
    dest.mkdir(parents=True, exist_ok=True)
    print(f"[{lang}] downloading Piper voice {name} -> {dest} ...")
    for filename in (f"{prefix}/{name}.onnx", f"{prefix}/{name}.onnx.json"):
        hf_hub_download(
            repo_id=PIPER_HF_REPO,
            filename=filename,
            local_dir=str(dest),
        )
    if not _has_voice(dest):
        print(f"[{lang}] WARNING: voice files not found under {dest} after download.")
    else:
        print(f"[{lang}] done -> {dest}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Download Piper TTS voices per language.")
    parser.add_argument(
        "--models-dir", default="models/tts", help="Root output folder (default: models/tts)."
    )
    parser.add_argument("--langs", default="vi,en", help="Comma-separated langs (default: vi,en).")
    args = parser.parse_args()

    root = Path(args.models_dir)
    langs = [l.strip().lower() for l in args.langs.split(",") if l.strip()]
    for lang in langs:
        download_voice(lang, root / lang)

    print("\nAll requested voices processed. TTS_ENGINE=piper (default) will use them.")


if __name__ == "__main__":
    main()
