"""Prepare an on-prem NMT model (CTranslate2 int8 NLLB) for OfflineNMTProvider.

Two ways to get the model into `--output-dir`:

  1) DOWNLOAD a pre-converted CTranslate2 int8 model (DEFAULT — recommended).
     No torch, no conversion, low RAM. ~600 MB for the 600M model.
         python tools/prepare_nllb.py
         python tools/prepare_nllb.py --ct2-repo JustFrederik/nllb-200-distilled-600M-ct2-int8

  2) CONVERT a raw Hugging Face NLLB model with CTranslate2 (needs `torch` and
     enough RAM to hold the float weights — ~6 GB for 1.3B; may OOM on small
     machines). Use only when no pre-converted int8 repo is available.
         pip install torch --index-url https://download.pytorch.org/whl/cpu
         python tools/prepare_nllb.py --convert facebook/nllb-200-distilled-1.3B

Then set OFFLINE_NMT_MODEL_DIR to the printed path in .env.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

# Pre-converted CTranslate2 int8 model with tokenizer files bundled.
DEFAULT_CT2_REPO = "JustFrederik/nllb-200-distilled-600M-ct2-int8"


def download_ct2(repo: str, out: Path) -> None:
    """Download a ready-made CTranslate2 int8 model dir from the Hub."""
    from huggingface_hub import snapshot_download

    snapshot_download(repo, local_dir=str(out))


def convert_hf(model: str, out: Path, quantization: str) -> None:
    """Convert a raw HF NLLB model to CTranslate2 (needs torch + RAM)."""
    # Invoke the converter through THIS interpreter (sys.executable) so it uses
    # the same venv that has ctranslate2 + transformers.
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
    # Save the tokenizer alongside the converted model (runtime needs it).
    from transformers import AutoTokenizer

    AutoTokenizer.from_pretrained(model).save_pretrained(str(out))


def main() -> int:
    ap = argparse.ArgumentParser(description="Prepare CTranslate2 NLLB model for on-prem NMT.")
    ap.add_argument(
        "--output-dir", default="models/nllb-200-distilled-600M-ct2-int8",
        help="Where to place the model dir (point OFFLINE_NMT_MODEL_DIR here).",
    )
    ap.add_argument(
        "--ct2-repo", default=None,
        help=f"Download this pre-converted CT2 int8 repo (default: {DEFAULT_CT2_REPO}).",
    )
    ap.add_argument(
        "--convert", default=None, metavar="HF_MODEL",
        help="Instead of downloading, convert this raw HF model via torch (needs RAM).",
    )
    ap.add_argument("--quantization", default="int8", help="Quantization for --convert.")
    args = ap.parse_args()

    out = Path(args.output_dir)
    out.parent.mkdir(parents=True, exist_ok=True)

    if args.convert:
        convert_hf(args.convert, out, args.quantization)
    else:
        download_ct2(args.ct2_repo or DEFAULT_CT2_REPO, out)

    print(f"Done. Set OFFLINE_NMT_MODEL_DIR={out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
