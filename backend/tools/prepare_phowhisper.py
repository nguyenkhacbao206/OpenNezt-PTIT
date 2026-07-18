"""Prepare a PhoWhisper (VinAI) CTranslate2 model for PhoWhisperSTTProvider.

PhoWhisper is a Vietnamese-only fine-tune of Whisper. Faster-Whisper can run it
once converted to CTranslate2. Two ways to get the model into `--output-dir`:

  1) CONVERT a raw Hugging Face PhoWhisper model (DEFAULT). Needs `torch` +
     `transformers` + `ctranslate2`. `float16` is best for a GPU; use `int8` for
     CPU. ~1.5 GB for -large (fp16), ~800 MB for -medium.
         pip install torch --index-url https://download.pytorch.org/whl/cpu
         python tools/prepare_phowhisper.py                       # vinai/PhoWhisper-large, float16
         python tools/prepare_phowhisper.py --model vinai/PhoWhisper-medium --quantization int8

  2) DOWNLOAD a pre-converted CTranslate2 repo if one exists (no torch):
         python tools/prepare_phowhisper.py --ct2-repo <user/phowhisper-ct2>

faster-whisper needs `tokenizer.json` + `preprocessor_config.json` alongside the
converted weights, so this tool saves the fast tokenizer + feature extractor into
the output dir after conversion.

Then set PHOWHISPER_MODEL_DIR to the printed path in .env, plus:
    STT_ENGINE=phowhisper
    STT_DEVICE=cuda            # or cpu
    STT_COMPUTE_TYPE=float16   # or int8 on cpu
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

DEFAULT_HF_MODEL = "vinai/PhoWhisper-large"


def download_ct2(repo: str, out: Path) -> None:
    """Download a ready-made CTranslate2 PhoWhisper model dir from the Hub."""
    from huggingface_hub import snapshot_download

    snapshot_download(repo, local_dir=str(out))


def convert_hf(model: str, out: Path, quantization: str) -> None:
    """Convert a raw HF PhoWhisper model to CTranslate2 (needs torch + RAM)."""
    # Invoke the converter through THIS interpreter (sys.executable) so it uses
    # the same venv that has ctranslate2 + transformers. The transformers
    # converter auto-detects the Whisper architecture.
    subprocess.run(
        [
            sys.executable, "-m", "ctranslate2.converters.transformers",
            "--model", model,
            "--output_dir", str(out),
            "--quantization", quantization,
            "--force",
        ],
        check=True,
    )
    # faster-whisper loads the tokenizer + feature extractor from the model dir.
    # Save the FAST tokenizer (produces tokenizer.json) and the feature extractor
    # (produces preprocessor_config.json) alongside the converted weights.
    from transformers import WhisperFeatureExtractor, WhisperTokenizerFast

    WhisperTokenizerFast.from_pretrained(model).save_pretrained(str(out))
    WhisperFeatureExtractor.from_pretrained(model).save_pretrained(str(out))


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Prepare a CTranslate2 PhoWhisper model for on-prem VN STT."
    )
    ap.add_argument(
        "--output-dir", default="models/phowhisper-large-ct2",
        help="Where to place the model dir (point PHOWHISPER_MODEL_DIR here).",
    )
    ap.add_argument(
        "--model", default=DEFAULT_HF_MODEL, metavar="HF_MODEL",
        help=f"HF PhoWhisper model to convert (default: {DEFAULT_HF_MODEL}).",
    )
    ap.add_argument(
        "--ct2-repo", default=None,
        help="Instead of converting, download this pre-converted CT2 repo.",
    )
    ap.add_argument(
        "--quantization", default="float16",
        help="Quantization for --convert: float16 (GPU) or int8 (CPU).",
    )
    args = ap.parse_args()

    out = Path(args.output_dir)
    out.parent.mkdir(parents=True, exist_ok=True)

    if args.ct2_repo:
        download_ct2(args.ct2_repo, out)
    else:
        convert_hf(args.model, out, args.quantization)

    print(f"Done. Set PHOWHISPER_MODEL_DIR={out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
