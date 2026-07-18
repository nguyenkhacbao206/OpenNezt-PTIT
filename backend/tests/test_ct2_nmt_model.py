import os

import pytest

from app.core.config import settings

MODEL_DIR = settings.offline_nmt_model_dir
HAVE_MODEL = bool(MODEL_DIR) and os.path.isdir(MODEL_DIR)


def test_get_translator_missing_dir_raises():
    from app.providers.ct2_nmt import get_translator

    with pytest.raises(Exception):
        get_translator("does/not/exist", 0)


@pytest.mark.skipif(not HAVE_MODEL, reason="OFFLINE_NMT_MODEL_DIR not set/built")
def test_translate_one_vi_to_en():
    from app.providers.ct2_nmt import translate_one

    out = translate_one(MODEL_DIR, 0, "Tôi muốn thảo luận về doanh thu quý này.", "vi", "en", 4)
    assert out
    assert any(w in out.lower() for w in ("revenue", "quarter", "discuss"))


@pytest.mark.skipif(not HAVE_MODEL, reason="OFFLINE_NMT_MODEL_DIR not set/built")
def test_translate_one_en_to_vi():
    from app.providers.ct2_nmt import translate_one

    out = translate_one(MODEL_DIR, 0, "Let's start the meeting.", "en", "vi", 4)
    assert out and out.strip()
