"""Sherpa-onnx offline STT provider (gipformer VI + zipformer EN).

A drop-in `STTProvider` that runs the per-language sherpa-onnx transducers via
the shared `SherpaEngine`. Selected for `mode=offline` when the config sets
`STT_ENGINE=sherpa` (see providers/factory.py). NMT/TTS are unaffected — the two
GitHub projects this wraps only cover the ASR stage.

Why a separate provider from OfflineSTTProvider (Whisper):
  * Whisper is one multilingual model with auto-detect; sherpa is one model per
    language and needs an explicit `source_lang`.
  * sherpa returns plain text (no per-segment timing), so there is no segment
    mapping to do here.
"""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from ..core.config import settings
from .base import STTProvider, STTResult

log = logging.getLogger("providers.sherpa")


class SherpaSTTProvider(STTProvider):
    """Local STT via sherpa-onnx, one Zipformer transducer per language."""

    name = "sherpa-stt"

    def __init__(self) -> None:
        # Cheap: recognizers load lazily on the first transcribe for a language.
        from .sherpa_engine import get_sherpa_engine

        self._engine = get_sherpa_engine(
            models_dir=settings.sherpa_models_dir,
            use_int8=settings.sherpa_use_int8,
            num_threads=settings.sherpa_num_threads,
            decoding_method=settings.sherpa_decoding_method,
        )
        log.info("SherpaSTTProvider constructed (models load on first use).")

    async def transcribe(
        self, audio: bytes, source_lang: str
    ) -> AsyncIterator[STTResult]:
        """Transcribe one push-to-talk audio chunk to a single final result.

        `audio` is expected to be a mono PCM WAV (any sample rate — sherpa-onnx
        resamples to 16 kHz internally). For compressed formats, decode first.
        """
        import asyncio
        import io

        import numpy as np
        import soundfile as sf

        log.info("SherpaSTTProvider transcribing %d bytes (lang=%s).", len(audio), source_lang)
        # Decode WAV bytes -> float32 mono array (blocking work off the loop).
        data, sr = await asyncio.to_thread(sf.read, io.BytesIO(audio), dtype="float32")
        if data.ndim > 1:
            data = data.mean(axis=1)  # downmix to mono

        result = await asyncio.to_thread(
            self._engine.transcribe_array,
            np.asarray(data, dtype="float32"),
            source_lang,
            int(sr),
        )
        yield STTResult(text=result.text, lang=result.language, is_final=True)
