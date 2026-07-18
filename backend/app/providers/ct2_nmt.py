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


# Module-level cache: one (translator, tokenizer) per (model_dir, intra_threads).
_CACHE: dict[tuple[str, int], tuple[object, object]] = {}


def get_translator(model_dir: str, intra_threads: int) -> tuple[object, object]:
    """Load (once) and return the CTranslate2 translator + NLLB tokenizer.

    Raises on a missing/invalid model dir; the caller converts that into a
    handler-visible error.
    """
    key = (model_dir, intra_threads)
    cached = _CACHE.get(key)
    if cached is not None:
        return cached

    import ctranslate2  # heavy: import lazily
    from transformers import AutoTokenizer

    translator = ctranslate2.Translator(
        model_dir, device="cpu", compute_type="int8", intra_threads=intra_threads or 0
    )
    tokenizer = AutoTokenizer.from_pretrained(model_dir, local_files_only=True)
    _CACHE[key] = (translator, tokenizer)
    return translator, tokenizer


def translate_one(
    model_dir: str, intra_threads: int, text: str, src: str, tgt: str, beam: int
) -> str:
    """Translate a single string src->tgt via CTranslate2 (blocking CPU work)."""
    if not text or not text.strip():
        return ""
    translator, tokenizer = get_translator(model_dir, intra_threads)

    tokenizer.src_lang = to_flores(src)
    src_tokens = tokenizer.convert_ids_to_tokens(tokenizer.encode(text))
    tgt_token = to_flores(tgt)

    results = translator.translate_batch(
        [src_tokens],
        target_prefix=[[tgt_token]],
        beam_size=beam,
        max_input_length=0,
    )
    out_tokens = results[0].hypotheses[0]
    if out_tokens and out_tokens[0] == tgt_token:
        out_tokens = out_tokens[1:]
    return tokenizer.decode(
        tokenizer.convert_tokens_to_ids(out_tokens), skip_special_tokens=True
    ).strip()
