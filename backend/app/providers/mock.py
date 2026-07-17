"""Mock providers: fully working, zero external dependencies.

These make the whole pipeline run end-to-end immediately so the frontend can
integrate right away. They ignore the real audio payload and return canned
data with realistic-looking timing.
"""
from __future__ import annotations

import asyncio
import base64
import struct
from collections.abc import AsyncIterator

from .base import NMTProvider, STTProvider, STTResult, TTSProvider

# A couple of sample sentences per language so demos look alive.
_SAMPLE_TEXT: dict[str, str] = {
    "vi": "Xin chào, chúng ta bắt đầu cuộc họp về doanh thu quý này.",
    "en": "Hello, let's start the meeting about this quarter's revenue.",
}
_DEFAULT_SAMPLE = "This is a sample transcription."


class MockSTTProvider(STTProvider):
    """Returns sample text, emitting one partial then one final result."""

    name = "mock-stt"

    async def transcribe(
        self, audio: bytes, source_lang: str
    ) -> AsyncIterator[STTResult]:
        """Yield a partial (first half) then the final sample sentence."""
        text = _SAMPLE_TEXT.get(source_lang, _DEFAULT_SAMPLE)

        # Simulate a streaming partial hypothesis.
        await asyncio.sleep(0.02)
        half = text[: max(1, len(text) // 2)]
        yield STTResult(text=half, lang=source_lang, is_final=False)

        # Simulate finishing the utterance.
        await asyncio.sleep(0.02)
        yield STTResult(text=text, lang=source_lang, is_final=True)


class MockNMTProvider(NMTProvider):
    """Echo translator: prefixes the text to prove the pipeline wiring."""

    name = "mock-nmt"

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        """Return an echoed 'translation' with a language-tagged prefix."""
        await asyncio.sleep(0.01)
        return f"[{source_lang}->{target_lang}] {text}"


class MockTTSProvider(TTSProvider):
    """Returns a tiny base64-encoded silent WAV clip."""

    name = "mock-tts"

    async def synthesize(self, text: str, lang: str) -> str:
        """Return base64 audio for a short silent WAV (valid, playable)."""
        await asyncio.sleep(0.01)
        return _silent_wav_base64(duration_ms=200)


def _silent_wav_base64(duration_ms: int = 200, sample_rate: int = 16000) -> str:
    """Build a minimal silent 16-bit mono WAV and return it base64-encoded."""
    num_samples = int(sample_rate * duration_ms / 1000)
    data = b"\x00\x00" * num_samples  # 16-bit silence
    byte_rate = sample_rate * 2
    header = b"RIFF"
    header += struct.pack("<I", 36 + len(data))
    header += b"WAVEfmt "
    header += struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, byte_rate, 2, 16)
    header += b"data"
    header += struct.pack("<I", len(data))
    wav = header + data
    return base64.b64encode(wav).decode("ascii")
