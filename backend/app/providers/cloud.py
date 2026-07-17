"""Cloud providers: call external APIs, fall back to Mock when unconfigured.

These are STUBS. The real HTTP calls are left as clearly-marked TODO blocks so
you can drop in your vendor of choice (OpenAI Whisper, Google, DeepL,
ElevenLabs, Azure, ...) without touching the WebSocket layer.

Key behaviour required by the spec: if the relevant API key is missing from the
environment, transparently fall back to the corresponding MockProvider so the
demo never breaks.
"""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from ..core.config import settings
from .base import NMTProvider, STTProvider, STTResult, TTSProvider
from .mock import MockNMTProvider, MockSTTProvider, MockTTSProvider

log = logging.getLogger("providers.cloud")


class CloudSTTProvider(STTProvider):
    """STT via an external API, or Mock fallback when no key is configured."""

    name = "cloud-stt"

    def __init__(self) -> None:
        self._fallback = MockSTTProvider()
        self._enabled = bool(settings.stt_api_key)
        if not self._enabled:
            log.warning("STT_API_KEY not set -> CloudSTTProvider falls back to mock.")

    async def transcribe(
        self, audio: bytes, source_lang: str
    ) -> AsyncIterator[STTResult]:
        """Transcribe via cloud API, or delegate to the mock provider."""
        if not self._enabled:
            async for result in self._fallback.transcribe(audio, source_lang):
                yield result
            return

        # ------------------------------------------------------------------
        # Gemini path: one multimodal generateContent call, one final result.
        # ------------------------------------------------------------------
        import base64

        from . import gemini_client

        audio_b64 = base64.b64encode(audio).decode("ascii")
        mime = gemini_client.sniff_audio_mime(audio)
        text = await gemini_client.transcribe_audio(
            settings.stt_api_key or "",
            settings.gemini_model,
            audio_b64,
            mime,
            source_lang,
        )
        yield STTResult(text=text, lang=source_lang, is_final=True)


class CloudNMTProvider(NMTProvider):
    """NMT via an external API, or Mock fallback when no key is configured."""

    name = "cloud-nmt"

    def __init__(self) -> None:
        self._fallback = MockNMTProvider()
        self._enabled = bool(settings.nmt_api_key)
        if not self._enabled:
            log.warning("NMT_API_KEY not set -> CloudNMTProvider falls back to mock.")

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        """Translate via cloud API, or delegate to the mock provider."""
        if not self._enabled:
            return await self._fallback.translate(text, source_lang, target_lang)

        # Gemini path: translate via generateContent.
        from . import gemini_client

        return await gemini_client.translate_text(
            settings.nmt_api_key or "",
            settings.gemini_model,
            text,
            source_lang,
            target_lang,
        )


class CloudTTSProvider(TTSProvider):
    """TTS via an external API, or Mock fallback when no key is configured."""

    name = "cloud-tts"

    def __init__(self) -> None:
        self._fallback = MockTTSProvider()
        self._enabled = bool(settings.tts_api_key)
        if not self._enabled:
            log.warning("TTS_API_KEY not set -> CloudTTSProvider falls back to mock.")

    async def synthesize(self, text: str, lang: str) -> str:
        """Synthesize via cloud API, or delegate to the mock provider."""
        if not self._enabled:
            return await self._fallback.synthesize(text, lang)

        # ------------------------------------------------------------------
        # TODO(cloud-tts): Call your TTS vendor here (ElevenLabs, Google,
        #   Azure, ...). Return base64-encoded audio.
        # ------------------------------------------------------------------
        raise NotImplementedError(
            "CloudTTSProvider: wire up your TTS vendor (TTS_API_URL)."
        )
