"""Unit tests for the business-glossary post-processing.

The glossary is applied to NMT *output*, so it must follow the turn's target
language. Regression guard: a VI->EN turn used to get the EN->VI table applied
to it, turning a correct "Revenue increased ..." back into
"doanh thu increased ..." (see handler._on_* -> apply_glossary).
"""
from __future__ import annotations

import pytest

from app.core.glossary import apply_glossary, list_glossaries


def test_list_glossaries_includes_defaults():
    ids = list_glossaries()
    assert "biz-default" in ids
    assert "finance" in ids


# --- EN -> VI turns: the table applies in its natural direction -------------

def test_en_target_replaces_english_terms_with_vietnamese():
    out = apply_glossary("Revenue increased and the deadline is Friday.",
                         "biz-default", "vi")
    assert "doanh thu" in out.lower()
    assert "hạn chót" in out.lower()
    assert "revenue" not in out.lower()


def test_multiword_term_is_replaced():
    out = apply_glossary("Cash flow is positive.", "finance", "vi")
    assert "dòng tiền" in out.lower()


# --- VI -> EN turns: the table must be INVERTED, not applied as-is ---------

def test_vi_source_terms_map_to_english_when_target_is_english():
    out = apply_glossary("doanh thu tăng và hạn chót là thứ sáu.",
                         "biz-default", "en")
    assert "revenue" in out.lower()
    assert "deadline" in out.lower()


def test_english_output_is_not_corrupted_back_into_vietnamese():
    """The exact regression: EN output of a VI->EN turn must stay English."""
    out = apply_glossary("Revenue increased 2.5 percent, the deadline is Friday.",
                         "biz-default", "en")
    assert "doanh thu" not in out.lower()
    assert "hạn chót" not in out.lower()
    assert "revenue" in out.lower()


# --- Safety / passthrough --------------------------------------------------

@pytest.mark.parametrize("gid", [None, "", "does-not-exist"])
def test_unknown_or_missing_glossary_is_passthrough(gid):
    text = "Revenue increased 2.5 percent."
    assert apply_glossary(text, gid, "vi") == text


def test_unknown_target_language_is_passthrough():
    """Never guess a direction — an unexpected lang must not mangle the text."""
    text = "Revenue increased 2.5 percent."
    assert apply_glossary(text, "biz-default", "fr") == text
    assert apply_glossary(text, "biz-default", None) == text


def test_capitalization_of_the_match_is_preserved():
    out = apply_glossary("Revenue increased.", "biz-default", "vi")
    assert out.startswith("Doanh thu")


def test_substring_is_not_replaced():
    """Whole-word only: 'deadlines' must not become 'hạn chóts'."""
    out = apply_glossary("Revenues and deadlines shifted.", "biz-default", "vi")
    assert "hạn chóts" not in out.lower()


def test_numbers_are_untouched():
    text = "Revenue grew 2.5 percent."
    assert "2.5" in apply_glossary(text, "biz-default", "vi")
