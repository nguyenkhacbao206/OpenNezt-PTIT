"""Latency measurement helpers using time.perf_counter for real timings."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from types import TracebackType


class Stopwatch:
    """A context manager that measures elapsed wall-clock time in milliseconds.

    Example:
        with Stopwatch() as sw:
            do_work()
        print(sw.ms)  # elapsed milliseconds as float
    """

    def __init__(self) -> None:
        self._start: float = 0.0
        self.ms: float = 0.0

    def __enter__(self) -> "Stopwatch":
        self._start = time.perf_counter()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.ms = (time.perf_counter() - self._start) * 1000.0


@dataclass
class TurnMetrics:
    """Latency figures for a single spoken turn, in milliseconds.

    Sent to the client as the `metrics` event for the Latency HUD.
    """

    stt_ms: float = 0.0
    nmt_ms: float = 0.0
    tts_ms: float = 0.0
    e2e_ms: float = 0.0
    _t0: float = field(default_factory=time.perf_counter, repr=False)

    def finish(self) -> None:
        """Freeze the end-to-end latency measured from turn creation."""
        self.e2e_ms = (time.perf_counter() - self._t0) * 1000.0

    def as_event(self) -> dict[str, float]:
        """Serialize into the `metrics` websocket payload."""
        return {
            "sttMs": round(self.stt_ms, 2),
            "nmtMs": round(self.nmt_ms, 2),
            "ttsMs": round(self.tts_ms, 2),
            "e2eMs": round(self.e2e_ms, 2),
        }

    def summary(self, speaker: str = "?", mode: str = "") -> str:
        """One-line latency breakdown for the SERVER LOG (times in ms).

        `e2e` is server-side processing time (from audio.chunk received to the turn
        being done); it does NOT include network to/from the client. Use it while
        testing to see where a turn's time goes — STT vs NMT vs TTS. Kept ASCII-only
        so it prints on Windows cp1252 consoles.
        """
        m = f" mode={mode}" if mode else ""
        return (
            f"latency speaker={speaker}{m} "
            f"stt={self.stt_ms:.0f}ms nmt={self.nmt_ms:.0f}ms "
            f"tts={self.tts_ms:.0f}ms e2e={self.e2e_ms:.0f}ms (server-side)"
        )
