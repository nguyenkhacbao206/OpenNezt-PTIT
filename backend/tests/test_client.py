"""Sample WebSocket client for manual end-to-end verification.

Connects to the running server, starts a session, sends a fake audio chunk,
and prints every event received. Also exercises config.update (toggle TTS)
and session.end.

Usage:
    1) Start the server:   uvicorn app.main:app --reload
    2) In another shell:   python tests/test_client.py

Expected console output includes, in order:
    stt.partial -> stt.final -> nmt.result -> tts.audio -> metrics
"""
from __future__ import annotations

import asyncio
import base64
import json
import sys

import websockets

# Windows consoles default to cp1252 and choke on Vietnamese text; force UTF-8.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

WS_URL = "ws://localhost:8000/ws"

# A tiny fake audio payload (content is irrelevant to the mock providers).
FAKE_AUDIO_B64 = base64.b64encode(b"fake-pcm-audio-bytes").decode("ascii")


async def _send(ws: "websockets.WebSocketClientProtocol", event: str, data: dict) -> None:
    """Send a `{type, data}` envelope."""
    await ws.send(json.dumps({"type": event, "data": data}))
    print(f">>> sent {event}: {data if event != 'audio.chunk' else '<audio ...>'}")


async def _drain(ws: "websockets.WebSocketClientProtocol", count: int, timeout: float = 5.0) -> None:
    """Print up to `count` incoming events (or until timeout)."""
    for _ in range(count):
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
        except asyncio.TimeoutError:
            return
        msg = json.loads(raw)
        print(f"<<< {msg['type']}: {json.dumps(msg['data'], ensure_ascii=False)[:120]}")


async def main() -> None:
    """Run the full happy-path scenario against the server."""
    async with websockets.connect(WS_URL) as ws:
        # 1) Start a session in mock mode, Vietnamese -> English.
        await _send(ws, "session.start", {"mode": "mock", "sourceLang": "vi", "targetLang": "en"})
        await _drain(ws, count=1)  # session.started

        # 2) Push-to-talk: send one audio chunk and read the full turn.
        await _send(ws, "audio.chunk", {"speaker": "A", "audio": FAKE_AUDIO_B64})
        # Expect: stt.partial, stt.final, nmt.result, tts.audio, metrics
        await _drain(ws, count=5)

        # 3) Toggle TTS off via config.update, then send another chunk.
        await _send(ws, "config.update", {"ttsOn": False})
        await _drain(ws, count=1)  # config.updated
        await _send(ws, "audio.chunk", {"speaker": "B", "audio": FAKE_AUDIO_B64})
        # Expect: stt.partial, stt.final, nmt.result, metrics (no tts.audio)
        await _drain(ws, count=4)

        # 4) End the session (server wipes buffers).
        await _send(ws, "session.end", {})
        await _drain(ws, count=1)  # session.ended

    print("\nDone. If you saw stt.partial -> stt.final -> nmt.result -> metrics, the base works.")


if __name__ == "__main__":
    asyncio.run(main())
