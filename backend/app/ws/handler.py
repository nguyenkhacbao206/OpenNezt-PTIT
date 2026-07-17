"""WebSocket event parsing and per-turn pipeline orchestration.

The handler is transport-only: it parses incoming events, drives the
STT -> NMT -> (TTS) pipeline via provider abstractions, measures latency, and
emits response events. It never imports a concrete provider, so changing the
provider mode requires no changes here.

Wire protocol (JSON):
    Client -> Server: {"type": <event>, "data": {...}}
    Server -> Client: {"type": <event>, "data": {...}}
"""
from __future__ import annotations

import base64
import binascii
import logging

from fastapi import WebSocket

from ..core.glossary import apply_glossary
from ..core.metrics import Stopwatch, TurnMetrics
from ..core.session import SessionState

log = logging.getLogger("ws.handler")


async def send(ws: WebSocket, event: str, data: dict) -> None:
    """Send a `{type, data}` envelope to the client."""
    await ws.send_json({"type": event, "data": data})


async def send_error(
    ws: WebSocket, code: str, message: str, can_fallback: bool = True
) -> None:
    """Emit an `error` event. `can_fallback` hints the UI to switch mode."""
    log.warning("error code=%s msg=%s", code, message)
    await send(ws, "error", {"code": code, "message": message, "canFallback": can_fallback})


async def dispatch(ws: WebSocket, session: SessionState, message: dict) -> None:
    """Route one parsed client message to the right handler."""
    event = message.get("type")
    data = message.get("data") or {}

    if event == "session.start":
        await _on_session_start(ws, session, data)
    elif event == "audio.chunk":
        await _on_audio_chunk(ws, session, data)
    elif event == "audio.partial":
        await _on_audio_partial(ws, session, data)
    elif event == "config.update":
        await _on_config_update(ws, session, data)
    elif event == "session.end":
        await _on_session_end(ws, session, data)
    else:
        await send_error(ws, "unknown_event", f"Unknown event: {event}", can_fallback=False)


# --------------------------------------------------------------------------- #
# Event handlers
# --------------------------------------------------------------------------- #
async def _on_session_start(ws: WebSocket, session: SessionState, data: dict) -> None:
    """Handle session.start: initialize state and build providers."""
    session.start(
        mode=data.get("mode", session.mode),
        source_lang=data.get("sourceLang", session.source_lang),
        target_lang=data.get("targetLang", session.target_lang),
    )
    await send(
        ws,
        "session.started",
        {
            "mode": session.mode,
            "sourceLang": session.source_lang,
            "targetLang": session.target_lang,
            "ttsOn": session.tts_on,
            "glossaryId": session.glossary_id,
        },
    )


async def _on_config_update(ws: WebSocket, session: SessionState, data: dict) -> None:
    """Handle config.update: change mode / ttsOn / glossary mid-session."""
    if "mode" in data and data["mode"]:
        session.set_mode(data["mode"])
    if "ttsOn" in data and data["ttsOn"] is not None:
        session.tts_on = bool(data["ttsOn"])
    if "glossaryId" in data:
        session.glossary_id = data["glossaryId"]

    await send(
        ws,
        "config.updated",
        {
            "mode": session.mode,
            "ttsOn": session.tts_on,
            "glossaryId": session.glossary_id,
        },
    )


async def _on_session_end(ws: WebSocket, session: SessionState, data: dict) -> None:
    """Handle session.end: zero-retention cleanup and acknowledge."""
    session.cleanup()
    await send(ws, "session.ended", {})


async def _on_audio_partial(ws: WebSocket, session: SessionState, data: dict) -> None:
    """Live streaming turn: transcribe a growing audio window and emit a
    translation of what has been said SO FAR, while the speaker keeps talking.

    Best-effort: any failure is swallowed (no `error` event, no disconnect) —
    a dropped partial is harmless; the authoritative result still arrives via
    `audio.chunk` -> `nmt.result`.
    """
    if not session.started or session.providers is None:
        return

    speaker = data.get("speaker", "unknown")
    try:
        audio = base64.b64decode(data.get("audio", ""), validate=False)
    except (binascii.Error, ValueError):
        return

    try:
        # Transcribe the window; take its final hypothesis as the text-so-far.
        window_text: str | None = None
        async for result in session.providers.stt.transcribe(audio, session.source_lang):
            if result.is_final:
                window_text = result.text
        if not window_text or not window_text.strip():
            return

        await send(ws, "stt.partial", {"speaker": speaker, "text": window_text})

        dst_text = await session.providers.nmt.translate_partial(
            window_text, session.source_lang, session.target_lang
        )
        dst_text = apply_glossary(dst_text, session.glossary_id)
        await send(ws, "nmt.partial", {
            "speaker": speaker,
            "srcText": window_text,
            "dstText": dst_text,
            "isFinal": False,
        })
    except Exception as exc:  # noqa: BLE001 - partials are best-effort
        log.info("partial turn skipped for speaker=%s: %s", speaker, exc)


async def _on_audio_chunk(ws: WebSocket, session: SessionState, data: dict) -> None:
    """Run one full spoken turn: STT -> NMT -> optional TTS -> metrics.

    Every stage is wrapped so a provider failure emits an `error` event with
    canFallback=true instead of crashing the connection.
    """
    if not session.started or session.providers is None:
        await send_error(ws, "no_session", "session.start must be sent first.", can_fallback=False)
        return

    speaker = data.get("speaker", "unknown")
    metrics = TurnMetrics()  # starts the end-to-end clock

    # Decode audio (base64 -> bytes). Content is unused by the mock providers.
    try:
        audio = base64.b64decode(data.get("audio", ""), validate=False)
    except (binascii.Error, ValueError):
        await send_error(ws, "bad_audio", "audio must be valid base64.", can_fallback=False)
        return
    session.remember_audio(speaker, audio)

    # ---- STT -------------------------------------------------------------
    final_text: str | None = None
    final_lang: str = session.source_lang
    try:
        with Stopwatch() as sw_stt:
            async for result in session.providers.stt.transcribe(audio, session.source_lang):
                if result.is_final:
                    final_text = result.text
                    final_lang = result.lang
                    session.remember_text(speaker, result.text)
                    await send(ws, "stt.final", {
                        "speaker": speaker,
                        "text": result.text,
                        "lang": result.lang,
                    })
                else:
                    await send(ws, "stt.partial", {"speaker": speaker, "text": result.text})
        metrics.stt_ms = sw_stt.ms
    except Exception as exc:  # noqa: BLE001 - keep the server alive on any provider failure
        await send_error(ws, "stt_failed", f"STT provider failed: {exc}")
        return

    if not final_text:
        await send_error(ws, "stt_empty", "No final transcript produced.", can_fallback=False)
        return

    # ---- NMT -------------------------------------------------------------
    try:
        with Stopwatch() as sw_nmt:
            dst_text = await session.providers.nmt.translate(
                final_text, session.source_lang, session.target_lang
            )
        dst_text = apply_glossary(dst_text, session.glossary_id)
        metrics.nmt_ms = sw_nmt.ms
        await send(ws, "nmt.result", {
            "speaker": speaker,
            "srcText": final_text,
            "dstText": dst_text,
        })
    except Exception as exc:  # noqa: BLE001
        await send_error(ws, "nmt_failed", f"NMT provider failed: {exc}")
        return

    # ---- TTS (optional) --------------------------------------------------
    if session.tts_on:
        try:
            audio_b64 = await session.providers.tts.synthesize(dst_text, session.target_lang)
            await send(ws, "tts.audio", {"speaker": speaker, "audio": audio_b64})
        except Exception as exc:  # noqa: BLE001 - TTS failure must not kill the turn
            await send_error(ws, "tts_failed", f"TTS provider failed: {exc}")

    # ---- Metrics ---------------------------------------------------------
    metrics.finish()
    await send(ws, "metrics", metrics.as_event())
