"""FastAPI application: HTTP health + the /ws WebSocket route.

Run with:  uvicorn app.main:app --reload
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .core.glossary import list_glossaries
from .core.session import SessionState
from .providers.factory import VALID_MODES
from .ws.handler import dispatch

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("app.main")

app = FastAPI(
    title="Real-Time VI<->EN Business Meeting Translator",
    version="0.1.0",
    description="Modular STT/NMT/TTS pipeline over WebSocket.",
)

# Open CORS for local hackathon development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root() -> dict:
    """Health check + quick capabilities summary."""
    return {
        "status": "ok",
        "service": "vi-en-meeting-translator",
        "modes": list(VALID_MODES),
        "defaultMode": settings.default_mode,
        "glossaries": list_glossaries(),
        "ws": "/ws",
    }


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    """Main WebSocket endpoint. One SessionState per connection.

    The connection lifecycle owns cleanup: whether the client sends
    session.end or simply drops, `session.cleanup()` runs in `finally`,
    guaranteeing zero retention of audio/text buffers.
    """
    await ws.accept()
    session = SessionState(mode=settings.default_mode)
    log.info("WebSocket connected.")
    try:
        while True:
            message = await ws.receive_json()
            await dispatch(ws, session, message)
    except WebSocketDisconnect:
        log.info("WebSocket disconnected by client.")
    except Exception as exc:  # noqa: BLE001 - never let the loop crash silently
        log.exception("Unexpected WebSocket error: %s", exc)
    finally:
        session.cleanup()  # zero-retention guarantee on any exit path
        log.info("WebSocket closed, session wiped.")
