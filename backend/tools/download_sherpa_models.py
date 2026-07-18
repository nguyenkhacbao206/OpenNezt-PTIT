"""Download the per-language sherpa-onnx STT models used by SherpaSTTProvider.

Fetches into <models_dir>/<lang>/ so the engine's auto-discovery finds them:

    Vietnamese (vi) -> gipformer            https://github.com/ggroup-ai-lab/gipformer
    English    (en) -> zipformer-en-2023-06-26  (k2-fsa/sherpa-onnx release)

Usage (from the `backend/` folder):
    python tools/download_sherpa_models.py               # both vi + en
    python tools/download_sherpa_models.py --langs vi    # just Vietnamese
    python tools/download_sherpa_models.py --models-dir models

After it finishes, set in .env:
    STT_ENGINE=sherpa
and run the server (mode=offline) or:
    python tools/record_stt.py --engine sherpa --lang vi
"""
from __future__ import annotations

import argparse
import sys
import tarfile
import urllib.request
from pathlib import Path

# Vietnamese: gipformer on the HuggingFace Hub (Zipformer transducer ONNX).
# Files live at the repo root: encoder/decoder/joiner-epoch-35-avg-6.onnx
# (+ .int8 variants) and tokens.txt.
GIPFORMER_HF_REPO = "g-group-ai-lab/gipformer-65M-rnnt"

# English: prebuilt sherpa-onnx zipformer release tarball (encoder/decoder/joiner + tokens).
EN_TARBALL_URL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/"
    "asr-models/sherpa-onnx-zipformer-en-2023-06-26.tar.bz2"
)


def _has_model(dest: Path) -> bool:
    """True if dest already contains an encoder + tokens (avoid re-downloading)."""
    return any(dest.rglob("*encoder*.onnx")) and any(dest.rglob("tokens.txt"))


def download_vi(dest: Path) -> None:
    """Download gipformer ONNX + tokens into dest via huggingface_hub."""
    if _has_model(dest):
        print(f"[vi] already present in {dest} — skipping.")
        return
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        sys.exit("huggingface_hub not installed. Run: pip install huggingface_hub")

    print(f"[vi] downloading gipformer ({GIPFORMER_HF_REPO}) -> {dest} ...")
    dest.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=GIPFORMER_HF_REPO,
        local_dir=str(dest),
        allow_patterns=["*.onnx", "tokens.txt", "*/tokens.txt", "*/*.onnx"],
    )
    if not _has_model(dest):
        print(
            f"[vi] WARNING: no encoder/tokens found under {dest}. "
            "Check the gipformer repo layout and copy encoder/decoder/joiner/tokens.txt in manually."
        )
    else:
        print(f"[vi] done -> {dest}")


def download_en(dest: Path) -> None:
    """Download + extract the English zipformer tarball into dest."""
    if _has_model(dest):
        print(f"[en] already present in {dest} — skipping.")
        return
    dest.mkdir(parents=True, exist_ok=True)
    tar_path = dest / "en-model.tar.bz2"
    print(f"[en] downloading {EN_TARBALL_URL} ...")
    urllib.request.urlretrieve(EN_TARBALL_URL, tar_path)  # noqa: S310 - fixed trusted URL
    print(f"[en] extracting -> {dest} ...")
    with tarfile.open(tar_path, "r:bz2") as tar:
        tar.extractall(dest)  # noqa: S202 - trusted archive from k2-fsa release
    tar_path.unlink(missing_ok=True)
    if not _has_model(dest):
        print(f"[en] WARNING: no encoder/tokens found under {dest} after extract.")
    else:
        print(f"[en] done -> {dest}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Download sherpa-onnx STT models per language.")
    parser.add_argument("--models-dir", default="models", help="Root output folder (default: models).")
    parser.add_argument("--langs", default="vi,en", help="Comma-separated langs to fetch (default: vi,en).")
    args = parser.parse_args()

    root = Path(args.models_dir)
    langs = [l.strip().lower() for l in args.langs.split(",") if l.strip()]

    handlers = {"vi": download_vi, "en": download_en}
    for lang in langs:
        handler = handlers.get(lang)
        if handler is None:
            print(f"[{lang}] no known download source — place its model in {root / lang}/ manually.")
            continue
        handler(root / lang)

    print("\nAll requested models processed. Set STT_ENGINE=sherpa in .env to use them.")


if __name__ == "__main__":
    main()
