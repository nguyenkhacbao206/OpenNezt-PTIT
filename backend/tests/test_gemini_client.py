"""Unit tests for the pure request/response helpers in gemini_client."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.providers import gemini_client as gc  # noqa: E402


def test_sniff_wav():
    wav = b"RIFF" + b"\x00\x00\x00\x00" + b"WAVE" + b"fmt "
    assert gc.sniff_audio_mime(wav) == "audio/wav"


def test_sniff_ogg():
    assert gc.sniff_audio_mime(b"OggS----rest-of-header") == "audio/ogg"


def test_sniff_default_is_wav():
    assert gc.sniff_audio_mime(b"not-a-known-header") == "audio/wav"


def test_language_name_known_and_unknown():
    assert gc.language_name("vi") == "Vietnamese"
    assert gc.language_name("en") == "English"
    assert gc.language_name("zz") == "zz"


def test_transcribe_payload_carries_audio_and_lang():
    p = gc.build_transcribe_payload("QUJD", "audio/wav", "vi")
    parts = p["contents"][0]["parts"]
    assert "Vietnamese" in parts[0]["text"]
    assert parts[1]["inline_data"]["mime_type"] == "audio/wav"
    assert parts[1]["inline_data"]["data"] == "QUJD"


def test_translate_payload_carries_text_and_target():
    p = gc.build_translate_payload("Xin chào", "vi", "en")
    text = p["contents"][0]["parts"][0]["text"]
    assert "Xin chào" in text
    assert "English" in text


def test_extract_text_ok():
    resp = {"candidates": [{"content": {"parts": [{"text": "Hello world"}]}}]}
    assert gc.extract_text(resp) == "Hello world"


def test_extract_text_api_error_raises():
    with pytest.raises(RuntimeError, match="bad key"):
        gc.extract_text({"error": {"message": "bad key"}})


def test_extract_text_no_candidates_raises():
    with pytest.raises(RuntimeError):
        gc.extract_text({"candidates": []})


def test_extract_text_empty_parts_raises():
    resp = {"candidates": [{"content": {"parts": [{"text": ""}]}, "finishReason": "SAFETY"}]}
    with pytest.raises(RuntimeError):
        gc.extract_text(resp)


def test_extract_text_non_dict_error_raises():
    with pytest.raises(RuntimeError):
        gc.extract_text({"error": "flat string"})


def test_generate_wraps_transport_error():
    import asyncio

    import httpx

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, *args, **kwargs):
            raise httpx.ConnectError("boom")

    class FakeAsyncClientCtor:
        def __call__(self, *args, **kwargs):
            return FakeClient()

    orig = gc.httpx.AsyncClient
    gc.httpx.AsyncClient = FakeAsyncClientCtor()
    try:
        with pytest.raises(RuntimeError, match="Gemini request failed"):
            asyncio.run(gc._generate("k", "m", {}))
    finally:
        gc.httpx.AsyncClient = orig


def test_generate_wraps_bad_json():
    import asyncio

    class FakeResp:
        status_code = 200
        text = "oops"

        def json(self):
            raise ValueError("bad json")

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, *args, **kwargs):
            return FakeResp()

    class FakeAsyncClientCtor:
        def __call__(self, *args, **kwargs):
            return FakeClient()

    orig = gc.httpx.AsyncClient
    gc.httpx.AsyncClient = FakeAsyncClientCtor()
    try:
        with pytest.raises(RuntimeError, match="non-JSON"):
            asyncio.run(gc._generate("k", "m", {}))
    finally:
        gc.httpx.AsyncClient = orig
