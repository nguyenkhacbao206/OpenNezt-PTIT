"""Per-connection session state with strict zero-retention cleanup.

One SessionState lives per WebSocket connection. All audio/text lives in RAM
only. On session.end or disconnect, `cleanup()` wipes every buffer. Nothing is
ever written to disk.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from ..providers.factory import ProviderBundle, build_providers

log = logging.getLogger("core.session")


@dataclass
class SessionState:
    """Mutable state for a single meeting-translator connection."""

    mode: str = "mock"
    source_lang: str = "vi"
    target_lang: str = "en"
    tts_on: bool = True
    glossary_id: str | None = "biz-default"
    started: bool = False

    # Providers for the current mode (rebuilt when mode changes).
    providers: ProviderBundle | None = field(default=None, repr=False)

    # In-RAM transient buffers (zero-retention: cleared on end/disconnect).
    _audio_buffer: dict[str, list[bytes]] = field(default_factory=dict, repr=False)
    _text_buffer: dict[str, list[str]] = field(default_factory=dict, repr=False)

    def start(self, mode: str, source_lang: str, target_lang: str) -> None:
        """Initialize the session and build providers for `mode`."""
        self.mode = mode or self.mode
        self.source_lang = source_lang or self.source_lang
        self.target_lang = target_lang or self.target_lang
        self.providers = build_providers(self.mode)
        self.started = True
        log.info(
            "Session started mode=%s %s->%s",
            self.providers.mode,
            self.source_lang,
            self.target_lang,
        )

    def set_mode(self, mode: str) -> None:
        """Rebuild providers for a new mode mid-session (no reconnect needed)."""
        self.mode = mode
        self.providers = build_providers(mode)
        log.info("Session mode switched to %s", self.providers.mode)

    def remember_audio(self, speaker: str, audio: bytes) -> None:
        """Buffer an audio chunk in RAM for the current turn (transient)."""
        self._audio_buffer.setdefault(speaker, []).append(audio)

    def remember_text(self, speaker: str, text: str) -> None:
        """Buffer recognized text in RAM for the current turn (transient)."""
        self._text_buffer.setdefault(speaker, []).append(text)

    def cleanup(self) -> None:
        """Zero-retention wipe: drop all buffers and providers from memory."""
        self._audio_buffer.clear()
        self._text_buffer.clear()
        self.providers = None
        self.started = False
        log.info("Session cleaned up (buffers wiped, zero retention).")
