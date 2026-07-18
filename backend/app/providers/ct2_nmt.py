"""CTranslate2 NLLB helpers for on-prem NMT.

Pure helpers (`to_flores`, `split_sentences`) import nothing heavy so they are
unit-testable without ctranslate2/transformers installed. The model wrapper
(`get_translator`, `translate_one`) imports those libs lazily inside the
functions and caches the loaded model.
"""
from __future__ import annotations

import re

# BCP-47-ish code -> FLORES-200 code expected by NLLB.
_FLORES = {"vi": "vie_Latn", "en": "eng_Latn"}

# Split after sentence-final punctuation (Latin + Vietnamese share these) or on
# newlines. Keeps the punctuation attached to the sentence it ends.
_SENT_SPLIT = re.compile(r"(?<=[.!?…;])\s+|\n+")


def to_flores(code: str) -> str:
    """Map a language code to its FLORES-200 code (default English)."""
    return _FLORES.get((code or "").lower(), "eng_Latn")


def split_sentences(text: str) -> list[str]:
    """Split text into trimmed, non-empty sentences for per-sentence decoding."""
    parts = (p.strip() for p in _SENT_SPLIT.split(text or ""))
    return [p for p in parts if p]
