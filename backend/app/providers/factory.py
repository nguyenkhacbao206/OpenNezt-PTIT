"""Provider factory: build an STT/NMT/TTS trio from the session `mode`.

This is the ONLY place that knows which concrete classes exist. Switching a
session between mock / cloud / offline happens here; the WebSocket handler is
unaffected.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..core.config import settings
from .base import NMTProvider, STTProvider, TTSProvider
from .cloud import CloudNMTProvider, CloudSTTProvider
from .mock import MockNMTProvider, MockSTTProvider, MockTTSProvider
from .offline import OfflineNMTProvider, OfflineSTTProvider, OfflineTTSProvider

# Valid mode strings accepted from config.
VALID_MODES = ("mock", "cloud", "offline")


def build_tts() -> TTSProvider:
    """Build the TTS provider, decoupled from the STT/NMT mode.

    TTS is picked by `settings.tts_engine`, NOT by the session mode, so a cloud
    (Groq) STT+NMT session still gets real local voices from Piper. When
    the engine is unavailable or misconfigured, the caller catches the error and
    the handler emits a `tts_failed` event without aborting the turn.
    """
    engine = settings.tts_engine.lower()
    if engine == "edge":
        from .tts_edge import EdgeTTSProvider

        return EdgeTTSProvider()
    if engine == "piper":
        return OfflineTTSProvider()
    return MockTTSProvider()


@dataclass
class ProviderBundle:
    """The three providers used for one session."""

    stt: STTProvider
    nmt: NMTProvider
    tts: TTSProvider
    mode: str


def build_providers(mode: str) -> ProviderBundle:
    """Instantiate the provider trio for `mode`.

    Args:
        mode: One of "mock", "cloud", "offline". Unknown values fall back to
            "mock" so a session can never fail to start.
    """
    normalized = (mode or "mock").lower()
    if normalized not in VALID_MODES:
        normalized = "mock"

    if normalized == "cloud":
        # TTS is decoupled from mode (see build_tts): cloud STT+NMT still gets
        # real local Piper voices.
        return ProviderBundle(
            stt=CloudSTTProvider(),
            nmt=CloudNMTProvider(),
            tts=build_tts(),
            mode="cloud",
        )
    if normalized == "offline":
        # STT engine is config-selectable: Whisper (multilingual), sherpa-onnx
        # (per-language gipformer VI + zipformer EN), or phowhisper (PhoWhisper
        # for VI + Whisper for EN).
        engine = settings.stt_engine.lower()
        if engine == "sherpa":
            from .sherpa import SherpaSTTProvider

            stt: STTProvider = SherpaSTTProvider()
        elif engine == "phowhisper":
            from .phowhisper import PhoWhisperSTTProvider

            stt = PhoWhisperSTTProvider()
        else:
            stt = OfflineSTTProvider()

        # NMT engine is config-selectable: NLLB CT2 (default) or a local chat
        # server (Ollama/vLLM) serving SeaLLM.
        if settings.nmt_engine.lower() == "seallm":
            from .local_nmt import LocalNMTProvider

            nmt: NMTProvider = LocalNMTProvider()
        else:
            nmt = OfflineNMTProvider()

        return ProviderBundle(
            stt=stt,
            nmt=nmt,
            tts=build_tts(),
            mode="offline",
        )

    return ProviderBundle(
        stt=MockSTTProvider(),
        nmt=MockNMTProvider(),
        tts=MockTTSProvider(),
        mode="mock",
    )
