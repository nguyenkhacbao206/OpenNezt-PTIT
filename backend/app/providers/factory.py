"""Provider factory: build an STT/NMT/TTS trio from the session `mode`.

This is the ONLY place that knows which concrete classes exist. Switching a
session between mock / cloud / offline happens here; the WebSocket handler is
unaffected.
"""
from __future__ import annotations

from dataclasses import dataclass

from .base import NMTProvider, STTProvider, TTSProvider
from .cloud import CloudNMTProvider, CloudSTTProvider, CloudTTSProvider
from .mock import MockNMTProvider, MockSTTProvider, MockTTSProvider
from .offline import OfflineNMTProvider, OfflineSTTProvider, OfflineTTSProvider

# Valid mode strings accepted from config.
VALID_MODES = ("mock", "cloud", "offline")


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
        return ProviderBundle(
            stt=CloudSTTProvider(),
            nmt=CloudNMTProvider(),
            tts=CloudTTSProvider(),
            mode="cloud",
        )
    if normalized == "offline":
        return ProviderBundle(
            stt=OfflineSTTProvider(),
            nmt=OfflineNMTProvider(),
            tts=OfflineTTSProvider(),
            mode="offline",
        )

    return ProviderBundle(
        stt=MockSTTProvider(),
        nmt=MockNMTProvider(),
        tts=MockTTSProvider(),
        mode="mock",
    )
