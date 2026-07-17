"""Unit tests: cloud STT/NMT use Gemini when a key is set, else fall back to mock."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_nmt_falls_back_to_mock_without_key(monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.settings, "nmt_api_key", None, raising=False)
    from app.providers.cloud import CloudNMTProvider

    prov = CloudNMTProvider()  # constructed AFTER patch -> disabled
    out = asyncio.run(prov.translate("xin chào", "vi", "en"))
    assert out.startswith("[vi->en]")


def test_nmt_uses_gemini_with_key(monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.settings, "nmt_api_key", "FAKEKEY", raising=False)
    monkeypatch.setattr(config.settings, "gemini_model", "gemini-2.0-flash", raising=False)

    from app.providers import gemini_client

    async def fake_translate(api_key, model, text, src, tgt):
        assert api_key == "FAKEKEY"
        assert (src, tgt) == ("vi", "en")
        return "Hello, we begin the meeting."

    monkeypatch.setattr(gemini_client, "translate_text", fake_translate)

    from app.providers.cloud import CloudNMTProvider

    prov = CloudNMTProvider()
    out = asyncio.run(prov.translate("Xin chào", "vi", "en"))
    assert out == "Hello, we begin the meeting."


def test_stt_falls_back_to_mock_without_key(monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.settings, "stt_api_key", None, raising=False)
    from app.providers.cloud import CloudSTTProvider

    prov = CloudSTTProvider()

    async def collect():
        return [r async for r in prov.transcribe(b"anything", "vi")]

    results = asyncio.run(collect())
    assert results[-1].is_final is True
    assert results[-1].text  # mock canned Vietnamese sentence


def test_stt_uses_gemini_with_key(monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.settings, "stt_api_key", "FAKEKEY", raising=False)
    monkeypatch.setattr(config.settings, "gemini_model", "gemini-2.0-flash", raising=False)

    from app.providers import gemini_client

    async def fake_transcribe(api_key, model, audio_b64, mime, source_lang):
        assert api_key == "FAKEKEY"
        assert mime == "audio/wav"
        assert source_lang == "vi"
        return "Xin chào, chúng ta bắt đầu."

    monkeypatch.setattr(gemini_client, "transcribe_audio", fake_transcribe)

    from app.providers.cloud import CloudSTTProvider

    prov = CloudSTTProvider()
    wav = b"RIFF\x00\x00\x00\x00WAVEfmt "

    async def collect():
        return [r async for r in prov.transcribe(wav, "vi")]

    results = asyncio.run(collect())
    assert len(results) == 1
    assert results[0].is_final is True
    assert results[0].text == "Xin chào, chúng ta bắt đầu."
    assert results[0].lang == "vi"
