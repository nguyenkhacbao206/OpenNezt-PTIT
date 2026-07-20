"""Preload the heavy local models at server startup.

Every local engine caches its model process-wide (`ct2_nmt._CACHE`,
`whisper_engine.get_engine`'s `lru_cache`, `piper_engine.get_piper_engine`'s
`lru_cache`), but the load is LAZY — without this module the very first speaker
of the first meeting pays the full NLLB + Whisper + Piper load time inside their
turn. Warming the same cached entry points at startup moves that cost to boot.

Two rules this module must keep:

- **Never block startup.** `run_warmup()` is fired as a background task, so the
  WebSocket accepts connections immediately; a client that connects mid-warm
  simply waits on the same cache entry.
- **Never crash the server.** A missing model dir is a valid state (e.g. running
  cloud-only). Every failure is logged as a warning and swallowed — the real
  error still surfaces per-turn via the handler's `error` event.

What gets warmed follows config, not the session: STT/NMT only matter when
`default_mode == "offline"`, but Piper TTS is mode-independent (`build_tts()`
picks it by `TTS_ENGINE`), so a cloud session with Piper is warmed too.
"""
from __future__ import annotations

import asyncio
import logging
import time

from .config import settings

log = logging.getLogger("core.warmup")


def _warm_nmt() -> str | None:
    """Load the CTranslate2 NLLB translator + tokenizer into the shared cache."""
    if settings.nmt_engine.lower() != "nllb":
        return None  # seallm/sealion are network calls — nothing to preload.
    model_dir = settings.offline_nmt_model_dir
    if not model_dir:
        return None
    from ..providers.ct2_nmt import get_translator

    get_translator(
        model_dir,
        settings.offline_nmt_intra_threads,
        settings.offline_nmt_device,
        settings.offline_nmt_compute_type,
    )
    return f"NMT nllb ({model_dir}, {settings.offline_nmt_device}/{settings.offline_nmt_compute_type})"


def _warm_stt() -> str | None:
    """Load the Faster-Whisper / PhoWhisper model(s) into the shared cache."""
    engine = settings.stt_engine.lower()
    if engine == "sherpa":
        return None  # sherpa loads per-language inside its own provider.

    from ..providers.whisper_engine import get_engine

    def _load(model: str) -> None:
        # get_engine() only builds the wrapper — WhisperEngine.__init__ sets
        # `_model = None` and defers to .load(), which transcribe_array() calls.
        # Without the explicit .load() here the warmup is a silent no-op.
        get_engine(
            model_size=model,
            device=settings.stt_device,
            compute_type=settings.stt_compute_type,
        ).load()

    if engine == "phowhisper":
        # PhoWhisper._engine() resolves to get_engine() per language: the VI dir
        # and the EN size are two separate cache entries, so warm both.
        loaded = []
        if settings.phowhisper_model_dir:
            _load(settings.phowhisper_model_dir)
            loaded.append(f"vi={settings.phowhisper_model_dir}")
        _load(settings.whisper_en_model)
        loaded.append(f"en={settings.whisper_en_model}")
        return f"STT phowhisper ({', '.join(loaded)})"

    _load(settings.stt_model_size)
    return f"STT whisper ({settings.stt_model_size}, {settings.stt_device}/{settings.stt_compute_type})"


def _warm_tts() -> str | None:
    """Load the Piper voices into the shared cache (edge/mock need nothing)."""
    if settings.tts_engine.lower() != "piper":
        return None
    from ..providers.piper_engine import get_piper_engine

    # Same lazy pattern as Whisper: the engine holds an empty `_voices` dict and
    # loads per language on first use, so warm both voices explicitly.
    piper = get_piper_engine(settings.piper_models_dir, settings.piper_length_scale)
    warmed = []
    for lang in ("vi", "en"):
        try:
            piper.load(lang)
            warmed.append(lang)
        except Exception as exc:  # noqa: BLE001 - one missing voice is not fatal
            log.warning("[warmup] Piper voice '%s' unavailable: %s", lang, exc)
    if not warmed:
        raise RuntimeError(f"no Piper voice loaded from {settings.piper_models_dir}")
    return f"TTS piper ({settings.piper_models_dir}, voices={'+'.join(warmed)})"


def _warm_one(label: str, fn) -> None:
    """Run one blocking loader, timing it; a failure is logged, never raised."""
    started = time.perf_counter()
    try:
        detail = fn()
    except Exception as exc:  # noqa: BLE001 - warmup must never break startup
        log.warning(
            "[warmup] %s failed (%.1fs): %s — the model will be retried on the "
            "first turn, which will be slow.",
            label, time.perf_counter() - started, exc,
        )
        return
    if detail is None:
        log.info("[warmup] %s skipped (not enabled by config).", label)
        return
    log.info("[warmup] %s ready in %.1fs.", detail, time.perf_counter() - started)


def _warm_all_blocking() -> None:
    """Load everything the current config will need. Runs in a worker thread."""
    offline = settings.default_mode.lower() == "offline"
    started = time.perf_counter()
    log.info("[warmup] preloading local models (mode=%s)...", settings.default_mode)
    if offline:
        _warm_one("NMT", _warm_nmt)
        _warm_one("STT", _warm_stt)
    else:
        log.info("[warmup] STT/NMT skipped (mode=%s uses remote providers).",
                 settings.default_mode)
    _warm_one("TTS", _warm_tts)
    log.info("[warmup] done in %.1fs — first turn will not pay model load time.",
             time.perf_counter() - started)


async def run_warmup() -> None:
    """Warm the model caches off the event loop so startup is not blocked."""
    if not settings.warmup_on_startup:
        log.info("[warmup] disabled (WARMUP_ON_STARTUP=false).")
        return
    await asyncio.to_thread(_warm_all_blocking)
