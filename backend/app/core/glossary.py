"""Business Glossary: term injection applied to NMT output.

A glossary is a table of EN<->VI term pairs selected by `glossaryId`. This is a
deliberately tiny hook so it can later be backed by a database or a per-tenant
terminology service without touching the pipeline.

**Direction matters.** The glossary runs on the NMT *output*, so it must be
applied toward the turn's TARGET language: on a VI->EN turn the EN terms are the
preferred ones, on an EN->VI turn the VI terms are. Applying the table in one
fixed direction corrupts half the turns — it used to rewrite a correct
"Revenue increased ..." back into "doanh thu increased ..." on every VI->EN turn.
"""
from __future__ import annotations

import re

# Sample glossaries. Keys are glossaryId values sent via config.update.
# Each entry maps the English term -> the preferred Vietnamese term; the table is
# inverted automatically when the target language is English.
GLOSSARIES: dict[str, dict[str, str]] = {
    "biz-default": {
        "revenue": "doanh thu",
        "stakeholder": "bên liên quan",
        "milestone": "cột mốc",
        "deadline": "hạn chót",
    },
    "finance": {
        "cash flow": "dòng tiền",
        "equity": "vốn chủ sở hữu",
        "valuation": "định giá",
        "runway": "thời gian sống sót",
    },
}

# Only these targets have a defined direction; anything else is a passthrough.
_SUPPORTED_TARGETS = ("vi", "en")


def list_glossaries() -> list[str]:
    """Return the available glossary ids."""
    return list(GLOSSARIES.keys())


def _match_case(replacement: str, matched: str) -> str:
    """Carry the matched text's capitalization over to the replacement.

    Without this, "Revenue increased." becomes "doanh thu increased." — the
    replacement is stored lowercase but the match started a sentence.
    """
    if matched[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


def apply_glossary(text: str, glossary_id: str | None, target_lang: str | None) -> str:
    """Apply the selected glossary's term replacements to `text`.

    Whole-word, case-insensitive replacement, applied in the direction of
    `target_lang`: "vi" rewrites EN terms to their VI equivalents, "en" does the
    reverse. Returns the input unchanged when no glossary is selected, the id is
    unknown, or the target language is not one this glossary has a direction for
    — never guess, a wrong guess mangles the translation.
    """
    if not glossary_id or not target_lang:
        return text
    terms = GLOSSARIES.get(glossary_id)
    if not terms:
        return text

    target = target_lang.lower()
    if target not in _SUPPORTED_TARGETS:
        return text
    # Stored as en -> vi; invert when translating into English.
    pairs = terms.items() if target == "vi" else ((v, k) for k, v in terms.items())

    result = text
    for term, replacement in pairs:
        pattern = re.compile(rf"\b{re.escape(term)}\b", flags=re.IGNORECASE)
        result = pattern.sub(lambda m: _match_case(replacement, m.group(0)), result)
    return result
