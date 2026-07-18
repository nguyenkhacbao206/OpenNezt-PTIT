import asyncio
import os

import pytest

from app.core.config import settings

MODEL_DIR = settings.offline_nmt_model_dir
HAVE_MODEL = bool(MODEL_DIR) and os.path.isdir(MODEL_DIR)


def test_translate_without_model_dir_raises(monkeypatch):
    monkeypatch.setattr(settings, "offline_nmt_model_dir", None)
    from app.providers.offline import OfflineNMTProvider

    provider = OfflineNMTProvider()
    with pytest.raises(RuntimeError, match="prepare_nllb"):
        asyncio.run(provider.translate("xin chào", "vi", "en"))


@pytest.mark.skipif(not HAVE_MODEL, reason="OFFLINE_NMT_MODEL_DIR not set/built")
def test_translate_multi_sentence():
    from app.providers.offline import OfflineNMTProvider

    provider = OfflineNMTProvider()
    out = asyncio.run(
        provider.translate("Tôi khỏe. Chúng ta bắt đầu họp.", "vi", "en")
    )
    assert out and len(out.split()) >= 3
