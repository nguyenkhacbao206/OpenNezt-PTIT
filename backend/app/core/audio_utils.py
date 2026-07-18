"""Audio guards to suppress Whisper hallucinations.

Whisper (and Groq's hosted Whisper) reliably *hallucinates* text on silence or
near-silent noise — classic outputs are "Thank you.", "Let's go!", "I don't hear
anything", or the Vietnamese "Ghiền Mì Gõ". In a streaming translator the client
sends many audio windows, some of which are silence; feeding those to STT injects
garbage into the transcript/history.

Root-cause fix: never send a silent/too-short window to STT. `is_silence()` parses
the WAV, measures RMS energy + duration, and reports whether it is below the
speech threshold. `looks_like_hallucination()` is a small exact-match backstop for
the handful of canned phrases Whisper emits on non-silent noise.
"""
from __future__ import annotations

import logging
import struct

from .config import settings

log = logging.getLogger("core.audio_utils")


def _parse_wav(wav: bytes) -> tuple[int, bytes] | None:
    """Return (sample_rate, pcm_data_bytes) for a 16-bit PCM WAV, or None.

    Returning None means "not a WAV I understand" — callers must treat that as
    'not silence' so real audio is never dropped on a parse miss.
    """
    if len(wav) < 44 or wav[:4] != b"RIFF" or wav[8:12] != b"WAVE":
        return None
    sample_rate = 16000
    data = b""
    i = 12
    n = len(wav)
    while i + 8 <= n:
        chunk_id = wav[i : i + 4]
        (size,) = struct.unpack("<I", wav[i + 4 : i + 8])
        body = wav[i + 8 : i + 8 + size]
        if chunk_id == b"fmt " and len(body) >= 16:
            (sample_rate,) = struct.unpack("<I", body[4:8])
        elif chunk_id == b"data":
            data = body
        i += 8 + size + (size & 1)  # chunks are word-aligned
    if not data:
        return None
    return sample_rate, data


def _rms_and_ms(sample_rate: int, pcm: bytes) -> tuple[float, float]:
    """Normalized RMS (0..1) and duration in ms for 16-bit mono PCM."""
    count = len(pcm) // 2
    if count == 0 or sample_rate <= 0:
        return 0.0, 0.0
    samples = struct.unpack(f"<{count}h", pcm[: count * 2])
    total = 0
    for s in samples:
        total += s * s
    rms = (total / count) ** 0.5 / 32768.0
    duration_ms = count / sample_rate * 1000.0
    return rms, duration_ms


def is_silence(wav: bytes) -> bool:
    """True if `wav` is below the speech-energy threshold or too short.

    Non-WAV / unparseable input returns False (never drop real audio on a miss).
    """
    parsed = _parse_wav(wav)
    if parsed is None:
        return False
    sample_rate, pcm = parsed
    rms, duration_ms = _rms_and_ms(sample_rate, pcm)
    if duration_ms < settings.stt_min_speech_ms:
        return True
    return rms < settings.stt_silence_rms


# Exact phrases Whisper/Groq emit on non-silent noise (lowercased, punctuation
# stripped). Backstop only — the energy gate handles the common silence case.
_HALLUCINATION_PHRASES: frozenset[str] = frozenset(
    {
        "thank you",
        "thank you very much",
        "thanks for watching",
        "thank you for watching",
        "please subscribe",
        "you",
        "bye",
        "bye bye",
        "cảm ơn các bạn đã theo dõi",
        "hẹn gặp lại các bạn",
        "ghiền mì gõ",
        "hãy subscribe cho kênh",
        "ừ",
    }
)


def looks_like_hallucination(text: str) -> bool:
    """True if the whole transcript is exactly a known canned hallucination."""
    norm = "".join(c for c in (text or "").lower().strip() if c.isalnum() or c.isspace())
    norm = " ".join(norm.split())
    return norm in _HALLUCINATION_PHRASES
