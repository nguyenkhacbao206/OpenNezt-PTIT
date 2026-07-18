"""One-time: download + convert an NLLB model to CTranslate2 int8 for on-prem NMT.

Requires `torch` for the conversion step only (runtime does not):
    pip install torch --index-url https://download.pytorch.org/whl/cpu

Usage (from backend/):
    python tools/prepare_nllb.py
    python tools/prepare_nllb.py --model facebook/nllb-200-distilled-600M \
        --output-dir models/nllb-200-distilled-600M-ct2-int8
Then set OFFLINE_NMT_MODEL_DIR to the printed path in .env.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser(description="Convert NLLB to CTranslate2 int8.")
    ap.add_argument("--model", default="facebook/nllb-200-distilled-1.3B")
    ap.add_argument(
        "--output-dir", default="models/nllb-200-distilled-1.3B-ct2-int8"
    )
    ap.add_argument("--quantization", default="int8")
    args = ap.parse_args()

    out = Path(args.output_dir)
    out.parent.mkdir(parents=True, exist_ok=True)

    # 1) Convert weights -> CTranslate2 int8.
    subprocess.run(
        [
            "ct2-transformers-converter",
            "--model", args.model,
            "--output_dir", str(out),
            "--quantization", args.quantization,
            "--force",
        ],
        check=True,
    )

    # 2) Save the tokenizer alongside the converted model (runtime needs it).
    from transformers import AutoTokenizer

    AutoTokenizer.from_pretrained(args.model).save_pretrained(str(out))

    print(f"Done. Set OFFLINE_NMT_MODEL_DIR={out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
