"""Business Glossary: term injection applied to NMT output.

A glossary is a simple mapping of {source_or_generic_term: preferred_translation}
selected by `glossaryId`. This is a deliberately tiny hook so it can later be
backed by a database or a per-tenant terminology service without touching the
pipeline.
"""
from __future__ import annotations

import re

# Sample glossaries. Keys are glossaryId values sent via config.update.
# Replacements are applied case-insensitively on whole words in the NMT output.
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


def list_glossaries() -> list[str]:
    """Return the available glossary ids."""
    return list(GLOSSARIES.keys())


def apply_glossary(text: str, glossary_id: str | None) -> str:
    """Apply the selected glossary's term replacements to `text`.

    Whole-word, case-insensitive replacement. Returns the input unchanged when
    no glossary is selected or the id is unknown.
    """
    if not glossary_id:
        return text
    terms = GLOSSARIES.get(glossary_id)
    if not terms:
        return text

    result = text
    for term, replacement in terms.items():
        pattern = re.compile(rf"\b{re.escape(term)}\b", flags=re.IGNORECASE)
        result = pattern.sub(replacement, result)
    return result
