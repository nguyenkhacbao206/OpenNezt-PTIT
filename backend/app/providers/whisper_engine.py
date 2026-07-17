"""Shared Faster-Whisper STT engine.

A thin wrapper around faster-whisper so both the standalone recording tool
(`tools/record_stt.py`) and the `OfflineSTTProvider` use the exact same model
loading and transcription code.

The model is downloaded automatically on first use (cached under
~/.cache/huggingface) and loaded ONCE per (model_size, device, compute_type).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache

import numpy as np

log = logging.getLogger("providers.whisper")

# Whisper always operates on 16 kHz mono audio.
SAMPLE_RATE = 16000


@dataclass
class Segment:
    """One transcribed segment with timing (seconds)."""

    start: float
    end: float
    text: str


@dataclass
class Transcription:
    """Full transcription result."""

    text: str
    language: str
    segments: list[Segment]


class WhisperEngine:
    """Lazy-loading Faster-Whisper wrapper.

    Args:
        model_size: whisper model, e.g. "tiny", "base", "small", "medium".
            "small" is a good VI+EN accuracy/speed trade-off on CPU.
        device: "cpu" or "cuda".
        compute_type: "int8" (CPU-friendly), "float16" (GPU), etc.
    """

    def __init__(
        self,
        model_size: str = "small",
        device: str = "cpu",
        compute_type: str = "int8",
    ) -> None:
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self._model = None  # loaded on first transcribe

    def load(self) -> None:
        """Load the model into memory (idempotent). Downloads on first run."""
        if self._model is not None:
            return
        # Imported here so the rest of the app doesn't require faster-whisper.
        from faster_whisper import WhisperModel

        log.info(
            "Loading Faster-Whisper model=%s device=%s compute=%s (first run downloads it)...",
            self.model_size,
            self.device,
            self.compute_type,
        )
        self._model = WhisperModel(
            self.model_size, device=self.device, compute_type=self.compute_type
        )
        log.info("Faster-Whisper model loaded.")

    def transcribe_array(
        self, audio: np.ndarray, language: str | None = None
    ) -> Transcription:
        """Transcribe a float32 mono waveform sampled at 16 kHz.

        Args:
            audio: 1-D float32 numpy array in [-1, 1] at 16 kHz.
            language: "vi" / "en" to force, or None to auto-detect.
        """
        self.load()
        assert self._model is not None

        # language="auto" and "" both mean auto-detect.
        lang = None if not language or language == "auto" else language

        segments_iter, info = self._model.transcribe(
            audio,
            language=lang,
            vad_filter=True,  # skip silence for cleaner segments
            beam_size=5,
        )
        segments = [
            Segment(start=s.start, end=s.end, text=s.text.strip())
            for s in segments_iter
        ]
        text = " ".join(s.text for s in segments).strip()
        return Transcription(text=text, language=info.language, segments=segments)


@lru_cache
def get_engine(
    model_size: str = "small", device: str = "cpu", compute_type: str = "int8"
) -> WhisperEngine:
    """Return a cached WhisperEngine so the model is shared/loaded once."""
    return WhisperEngine(model_size=model_size, device=device, compute_type=compute_type)
