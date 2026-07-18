"""Offline providers: empty stubs reserved for local models.

These intentionally raise NotImplementedError. Replace the bodies with local
inference:
  * OfflineSTTProvider -> Faster-Whisper
  * OfflineNMTProvider -> NLLB (No Language Left Behind)
  * OfflineTTSProvider -> Piper

Load the heavy models ONCE (e.g. in __init__ or a lazy loader) and keep them in
memory; do not reload per request.
"""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from .base import NMTProvider, STTProvider, STTResult, TTSProvider

log = logging.getLogger("providers.offline")


class OfflineSTTProvider(STTProvider):
    """Local STT via Faster-Whisper (shared WhisperEngine)."""

    name = "offline-stt"

    def __init__(self, model_size: str = "small") -> None:
        # The heavy model is loaded lazily on first transcribe and cached by
        # get_engine, so constructing the provider is cheap.
        from .whisper_engine import get_engine

        self._engine = get_engine(model_size=model_size)
        log.info("OfflineSTTProvider constructed (model loads on first use).")

    async def transcribe(
        self, audio: bytes, source_lang: str
    ) -> AsyncIterator[STTResult]:
        """Transcribe 16 kHz / 16-bit mono PCM WAV bytes to a final result.

        The audio.chunk payload is expected to be a mono 16-bit PCM WAV at
        16 kHz (what the recording tool and a browser MediaRecorder->WAV step
        produce). For other/compressed formats, decode via ffmpeg/PyAV first.
        """
        import asyncio
        import io

        import numpy as np
        import soundfile as sf

        log.info("OfflineSTTProvider transcribing %d bytes.", len(audio))
        # Decode WAV bytes -> float32 mono array (blocking work off the loop).
        data, sr = await asyncio.to_thread(sf.read, io.BytesIO(audio), dtype="float32")
        if data.ndim > 1:
            data = data.mean(axis=1)  # downmix to mono
        # TODO(offline-stt): resample here if sr != 16000 (e.g. via soxr/librosa).

        result = await asyncio.to_thread(
            self._engine.transcribe_array, np.asarray(data, dtype="float32"), source_lang
        )
        yield STTResult(text=result.text, lang=result.language, is_final=True)


class OfflineNMTProvider(NMTProvider):
    """Local NMT stub. Plug NLLB here."""

    name = "offline-nmt"

    def __init__(self) -> None:
        # TODO(offline-nmt): load NLLB model + tokenizer once.
        log.info("OfflineNMTProvider constructed (model not loaded).")

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        """Not implemented yet -> raises so the handler can emit a fallback."""
        log.warning("OfflineNMTProvider.translate called but not implemented.")
        raise NotImplementedError("Plug NLLB into OfflineNMTProvider.")


class OfflineTTSProvider(TTSProvider):
    """Local TTS via Piper (shared PiperEngine), one voice per language.

    Used for BOTH cloud and offline sessions (TTS is decoupled from the STT/NMT
    mode in the factory), so the translated text always comes back as a real
    spoken clip in the target language.
    """

    name = "offline-tts"

    def __init__(self) -> None:
        # The heavy voice is loaded lazily on first synthesize and cached by
        # get_piper_engine, so constructing the provider is cheap.
        from ..core.config import settings
        from .piper_engine import get_piper_engine

        self._engine = get_piper_engine(
            models_dir=settings.piper_models_dir,
            length_scale=settings.piper_length_scale,
        )
        log.info("OfflineTTSProvider constructed (Piper voice loads on first use).")

    async def synthesize(self, text: str, lang: str) -> str:
        """Synthesize `text` in `lang` to base64-encoded WAV bytes."""
        import asyncio
        import base64

        log.info("OfflineTTSProvider synthesizing %d chars in %s.", len(text), lang)
        wav = await asyncio.to_thread(self._engine.synthesize, text, lang)
        return base64.b64encode(wav).decode("ascii")
