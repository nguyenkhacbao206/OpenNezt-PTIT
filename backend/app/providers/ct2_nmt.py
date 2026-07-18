"""CTranslate2 NLLB helpers for on-prem NMT.

The pure helper `to_flores` imports nothing heavy so it is unit-testable without
ctranslate2/transformers installed. The model wrapper (`get_translator`,
`translate_one`) imports those libs lazily inside the functions and caches the
loaded model.
"""
from __future__ import annotations

# BCP-47-ish code -> FLORES-200 code expected by NLLB.
_FLORES = {"vi": "vie_Latn", "en": "eng_Latn"}


def to_flores(code: str) -> str:
    """Map a language code to its FLORES-200 code (default English)."""
    return _FLORES.get((code or "").lower(), "eng_Latn")


# Module-level cache: one (translator, tokenizer) per
# (model_dir, intra_threads, device, compute_type).
_CACHE: dict[tuple[str, int, str, str], tuple[object, object]] = {}


def get_translator(
    model_dir: str,
    intra_threads: int,
    device: str = "cpu",
    compute_type: str = "int8",
) -> tuple[object, object]:
    """Load (once) and return the CTranslate2 translator + NLLB tokenizer.

    `device`/`compute_type` pick CPU int8 (default) or GPU float16 (set
    "cuda"/"float16" for speed + best accuracy). Raises on a missing/invalid
    model dir; the caller converts that into a handler-visible error.
    """
    key = (model_dir, intra_threads, device, compute_type)
    cached = _CACHE.get(key)
    if cached is not None:
        return cached

    import ctranslate2  # heavy: import lazily
    from transformers import AutoTokenizer

    translator = ctranslate2.Translator(
        model_dir,
        device=device,
        compute_type=compute_type,
        intra_threads=intra_threads or 0,
    )
    tokenizer = AutoTokenizer.from_pretrained(model_dir, local_files_only=True)
    _CACHE[key] = (translator, tokenizer)
    return translator, tokenizer


def translate_one(
    model_dir: str,
    intra_threads: int,
    text: str,
    src: str,
    tgt: str,
    beam: int,
    device: str = "cpu",
    compute_type: str = "int8",
) -> str:
    """Translate a single string src->tgt via CTranslate2 (blocking work)."""
    if not text or not text.strip():
        return ""
    translator, tokenizer = get_translator(model_dir, intra_threads, device, compute_type)

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
