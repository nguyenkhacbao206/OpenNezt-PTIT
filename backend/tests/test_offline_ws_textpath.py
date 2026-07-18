import os

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

MODEL_DIR = settings.offline_nmt_model_dir
HAVE_MODEL = bool(MODEL_DIR) and os.path.isdir(MODEL_DIR)


def _recv_until(ws, type_, cap=10):
    for _ in range(cap):
        msg = ws.receive_json()
        if msg["type"] == type_:
            return msg
    raise AssertionError(f"did not see {type_}")


@pytest.mark.skipif(not HAVE_MODEL, reason="OFFLINE_NMT_MODEL_DIR not set/built")
def test_offline_text_path_translates():
    client = TestClient(app)
    with client.websocket_connect("/ws") as ws:
        ws.send_json(
            {"type": "session.start",
             "data": {"mode": "offline", "sourceLang": "vi", "targetLang": "en"}}
        )
        _recv_until(ws, "session.started")
        ws.send_json(
            {"type": "text.final", "data": {"speaker": "me", "text": "Xin chào mọi người."}}
        )
        result = _recv_until(ws, "nmt.result")
        assert result["data"]["dstText"].strip()
