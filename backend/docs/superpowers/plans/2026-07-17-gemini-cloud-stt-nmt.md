# Gemini Cloud STT + NMT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user speak Vietnamese and receive a real English transcript end-to-end by wiring the `cloud` provider trio's STT + NMT to Google Gemini.

**Architecture:** A pure/async `gemini_client` helper wraps Gemini's `generateContent` REST API. `CloudSTTProvider` (audio→Vietnamese text) and `CloudNMTProvider` (Vietnamese→English text) call it when their API key is set, else fall back to mock. A standalone `tools/talk_translate.py` records the mic and drives the WebSocket end-to-end.

**Tech Stack:** Python 3.13, FastAPI/WebSocket, `httpx` (async HTTP), `sounddevice`/`soundfile`/`numpy` (mic + WAV), `pytest` (unit tests), Google Gemini `gemini-2.0-flash`.

## Global Constraints

- **Provider isolation:** never import a concrete provider into `ws/handler.py`; only `factory.py` knows concrete classes. This plan touches `cloud.py` and adds `gemini_client.py` — no handler/factory changes needed.
- **Config via `core/config.py`** (pydantic-settings). No hard-coded keys; read through the `settings` singleton, never `os.environ`.
- **Zero-retention:** audio/text in RAM only; no disk writes in the server path or the tool. (Cloud mode transmits audio to Google over TLS — accepted.)
- **One key, two vars:** the same Google AI Studio key goes in both `STT_API_KEY` and `NMT_API_KEY`. Enablement gates are unchanged (`bool(settings.stt_api_key)` / `bool(settings.nmt_api_key)`).
- **Model:** default `gemini-2.0-flash`, overridable via `GEMINI_MODEL`.
- **STTProvider.transcribe** is an async generator; the Gemini path yields exactly one final `STTResult` (no partials).
- Run all commands from `backend/` with the venv active: `.venv\Scripts\Activate.ps1` (PowerShell).

---

### Task 1: Dependencies + Gemini model config

**Files:**
- Modify: `requirements.txt:22-25`
- Modify: `app/core/config.py:62-64`
- Modify: `.env`
- Modify: `.env.example`
- Test: `tests/test_config_gemini.py`

**Interfaces:**
- Produces: `settings.gemini_model: str` (default `"gemini-2.0-flash"`), env var `GEMINI_MODEL`.

- [ ] **Step 1: Install the minimal cloud subset into `.venv`**

The `.venv` is empty. Install only what the Gemini cloud path + tests + mic need (no torch/whisper/sherpa):

```bash
.venv\Scripts\python.exe -m pip install "fastapi>=0.110" "uvicorn[standard]>=0.29" "pydantic-settings>=2.2" "websockets>=12.0" "httpx>=0.27" "sounddevice>=0.4" "soundfile>=0.12" "numpy>=1.24" pytest
```

Expected: all wheels install without a build step.

- [ ] **Step 2: Uncomment `httpx` in requirements.txt**

Change the reserved block near line 22-25 so `httpx` is active:

```
# --- Cloud provider HTTP calls (CloudSTTProvider / CloudNMTProvider via Gemini) ---
httpx>=0.27

# --- Reserved for the rest of the real pipeline (uncomment when wiring) ---
# transformers>=4.40     # OfflineNMTProvider (NLLB)
# piper-tts              # OfflineTTSProvider (TTS)
```

- [ ] **Step 3: Write the failing test for the new setting**

Create `tests/test_config_gemini.py`:

```python
"""Unit test: the Gemini model setting exists with a sane default."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_gemini_model_default():
    from app.core.config import Settings

    s = Settings(_env_file=None)  # ignore any local .env
    assert s.gemini_model == "gemini-2.0-flash"
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `.venv\Scripts\python.exe -m pytest tests/test_config_gemini.py -v`
Expected: FAIL — `AttributeError`/`assert` because `gemini_model` does not exist yet.

- [ ] **Step 5: Add the setting to `config.py`**

Insert after the TTS block (currently ends at line 64):

```python
    # --- Gemini (Google AI Studio) model for cloud STT + NMT -------------
    # The SAME Google AI Studio key goes in both stt_api_key and nmt_api_key.
    # This selects the model used for both transcription and translation.
    gemini_model: str = "gemini-2.0-flash"
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `.venv\Scripts\python.exe -m pytest tests/test_config_gemini.py -v`
Expected: PASS.

- [ ] **Step 7: Document the key + model in `.env` and `.env.example`**

In BOTH `.env` and `.env.example`, replace the Cloud STT / NMT comment blocks so they read:

```
# --- Gemini for cloud STT + NMT (mode=cloud) -------------------------
# Get a free key at https://aistudio.google.com/apikey and paste the SAME
# key into BOTH STT_API_KEY and NMT_API_KEY. Leave blank to fall back to mock.
GEMINI_MODEL=gemini-2.0-flash

# --- Cloud STT (Gemini: put your Google AI Studio key here) ---
STT_API_KEY=
STT_API_URL=

# --- Cloud NMT (Gemini: put the SAME Google AI Studio key here) ---
NMT_API_KEY=
NMT_API_URL=
```

(Leave the TTS block unchanged.)

- [ ] **Step 8: Commit**

```bash
git add requirements.txt app/core/config.py .env.example tests/test_config_gemini.py docs/superpowers
git commit -m "feat(config): add GEMINI_MODEL setting and enable httpx for cloud providers"
```

(Note: `.env` is gitignored — do not commit it.)

---

### Task 2: `gemini_client` helper (payloads, response parsing, async calls)

**Files:**
- Create: `app/providers/gemini_client.py`
- Test: `tests/test_gemini_client.py`

**Interfaces:**
- Produces:
  - `language_name(code: str) -> str`
  - `sniff_audio_mime(audio: bytes) -> str`
  - `build_transcribe_payload(audio_b64: str, mime: str, source_lang: str) -> dict`
  - `build_translate_payload(text: str, source_lang: str, target_lang: str) -> dict`
  - `extract_text(response_json: dict) -> str` (raises `RuntimeError` on empty/blocked/error)
  - `async transcribe_audio(api_key: str, model: str, audio_b64: str, mime: str, source_lang: str) -> str`
  - `async translate_text(api_key: str, model: str, text: str, source_lang: str, target_lang: str) -> str`

- [ ] **Step 1: Write the failing tests for the pure helpers**

Create `tests/test_gemini_client.py`:

```python
"""Unit tests for the pure request/response helpers in gemini_client."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.providers import gemini_client as gc  # noqa: E402


def test_sniff_wav():
    wav = b"RIFF" + b"\x00\x00\x00\x00" + b"WAVE" + b"fmt "
    assert gc.sniff_audio_mime(wav) == "audio/wav"


def test_sniff_ogg():
    assert gc.sniff_audio_mime(b"OggS----rest-of-header") == "audio/ogg"


def test_sniff_default_is_wav():
    assert gc.sniff_audio_mime(b"not-a-known-header") == "audio/wav"


def test_language_name_known_and_unknown():
    assert gc.language_name("vi") == "Vietnamese"
    assert gc.language_name("en") == "English"
    assert gc.language_name("zz") == "zz"


def test_transcribe_payload_carries_audio_and_lang():
    p = gc.build_transcribe_payload("QUJD", "audio/wav", "vi")
    parts = p["contents"][0]["parts"]
    assert "Vietnamese" in parts[0]["text"]
    assert parts[1]["inline_data"]["mime_type"] == "audio/wav"
    assert parts[1]["inline_data"]["data"] == "QUJD"


def test_translate_payload_carries_text_and_target():
    p = gc.build_translate_payload("Xin chào", "vi", "en")
    text = p["contents"][0]["parts"][0]["text"]
    assert "Xin chào" in text
    assert "English" in text


def test_extract_text_ok():
    resp = {"candidates": [{"content": {"parts": [{"text": "Hello world"}]}}]}
    assert gc.extract_text(resp) == "Hello world"


def test_extract_text_api_error_raises():
    with pytest.raises(RuntimeError, match="bad key"):
        gc.extract_text({"error": {"message": "bad key"}})


def test_extract_text_no_candidates_raises():
    with pytest.raises(RuntimeError):
        gc.extract_text({"candidates": []})


def test_extract_text_empty_parts_raises():
    resp = {"candidates": [{"content": {"parts": [{"text": ""}]}, "finishReason": "SAFETY"}]}
    with pytest.raises(RuntimeError):
        gc.extract_text(resp)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv\Scripts\python.exe -m pytest tests/test_gemini_client.py -v`
Expected: FAIL — `ModuleNotFoundError: app.providers.gemini_client`.

- [ ] **Step 3: Write `gemini_client.py`**

Create `app/providers/gemini_client.py`:

```python
"""Async helpers over the Google Gemini `generateContent` REST API.

Shared by the cloud STT and NMT providers. The request-building and
response-parsing helpers are pure functions so they can be unit-tested without
network access or an API key; only the thin `_generate` wrapper does I/O.

Docs: https://ai.google.dev/api/generate-content
"""
from __future__ import annotations

import httpx

_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)
_TIMEOUT = 30.0

# BCP-47-ish language code -> human-readable name used in prompts.
_LANG_NAMES = {"vi": "Vietnamese", "en": "English"}


def language_name(code: str) -> str:
    """Map a language code to a human-readable name for prompts."""
    return _LANG_NAMES.get((code or "").lower(), code or "the source language")


def sniff_audio_mime(audio: bytes) -> str:
    """Best-effort MIME detection from magic bytes; default to audio/wav."""
    if len(audio) >= 12 and audio[0:4] == b"RIFF" and audio[8:12] == b"WAVE":
        return "audio/wav"
    if audio[0:4] == b"OggS":
        return "audio/ogg"
    if audio[0:3] == b"ID3" or (
        len(audio) >= 2 and audio[0] == 0xFF and (audio[1] & 0xE0) == 0xE0
    ):
        return "audio/mpeg"
    return "audio/wav"


def build_transcribe_payload(audio_b64: str, mime: str, source_lang: str) -> dict:
    """Build the generateContent body for transcribing spoken audio."""
    lang = language_name(source_lang)
    prompt = (
        f"Transcribe the following {lang} speech verbatim. "
        "Return ONLY the transcript text with no commentary, labels, quotes, "
        "or markdown."
    )
    return {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": mime, "data": audio_b64}},
                ]
            }
        ],
        "generationConfig": {"temperature": 0.0},
    }


def build_translate_payload(text: str, source_lang: str, target_lang: str) -> dict:
    """Build the generateContent body for translating text."""
    src = language_name(source_lang)
    tgt = language_name(target_lang)
    prompt = (
        f"Translate the following {src} text into {tgt}. "
        "Return ONLY the translation with no commentary, quotes, or markdown.\n\n"
        f"{text}"
    )
    return {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.0},
    }


def extract_text(response_json: dict) -> str:
    """Pull the model's text out of a generateContent response.

    Raises RuntimeError when the response has no usable text: an API error
    object, no candidates (e.g. a prompt-level safety block), or empty parts.
    """
    if "error" in response_json:
        msg = response_json["error"].get("message", "unknown error")
        raise RuntimeError(f"Gemini API error: {msg}")
    candidates = response_json.get("candidates") or []
    if not candidates:
        feedback = response_json.get("promptFeedback", {})
        raise RuntimeError(f"Gemini returned no candidates (feedback={feedback}).")
    parts = candidates[0].get("content", {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts).strip()
    if not text:
        reason = candidates[0].get("finishReason", "unknown")
        raise RuntimeError(f"Gemini returned empty text (finishReason={reason}).")
    return text


async def _generate(api_key: str, model: str, payload: dict) -> dict:
    """POST a payload to generateContent and return the parsed JSON."""
    url = _ENDPOINT.format(model=model)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(url, params={"key": api_key}, json=payload)
    if resp.status_code != 200:
        raise RuntimeError(f"Gemini HTTP {resp.status_code}: {resp.text[:200]}")
    return resp.json()


async def transcribe_audio(
    api_key: str, model: str, audio_b64: str, mime: str, source_lang: str
) -> str:
    """Transcribe base64-encoded audio to text via Gemini."""
    payload = build_transcribe_payload(audio_b64, mime, source_lang)
    return extract_text(await _generate(api_key, model, payload))


async def translate_text(
    api_key: str, model: str, text: str, source_lang: str, target_lang: str
) -> str:
    """Translate text from source_lang to target_lang via Gemini."""
    payload = build_translate_payload(text, source_lang, target_lang)
    return extract_text(await _generate(api_key, model, payload))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv\Scripts\python.exe -m pytest tests/test_gemini_client.py -v`
Expected: PASS (10 passed).

- [ ] **Step 5: Commit**

```bash
git add app/providers/gemini_client.py tests/test_gemini_client.py
git commit -m "feat(providers): add gemini_client helper for generateContent STT/NMT"
```

---

### Task 3: Wire `CloudSTTProvider` + `CloudNMTProvider` to Gemini

**Files:**
- Modify: `app/providers/cloud.py:34-57` (STT `transcribe`), `app/providers/cloud.py:71-82` (NMT `translate`)
- Test: `tests/test_cloud_providers.py`

**Interfaces:**
- Consumes: `gemini_client.transcribe_audio`, `gemini_client.translate_text`, `gemini_client.sniff_audio_mime`, `settings.gemini_model`.
- Produces: no new public names; behavior change only (real Gemini path when key present, mock fallback when absent).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_cloud_providers.py`:

```python
"""Unit tests: cloud STT/NMT use Gemini when a key is set, else fall back to mock."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_nmt_falls_back_to_mock_without_key(monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.settings, "nmt_api_key", None, raising=False)
    from app.providers.cloud import CloudNMTProvider

    prov = CloudNMTProvider()  # constructed AFTER patch -> disabled
    out = asyncio.run(prov.translate("xin chào", "vi", "en"))
    assert out.startswith("[vi->en]")


def test_nmt_uses_gemini_with_key(monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.settings, "nmt_api_key", "FAKEKEY", raising=False)
    monkeypatch.setattr(config.settings, "gemini_model", "gemini-2.0-flash", raising=False)

    from app.providers import gemini_client

    async def fake_translate(api_key, model, text, src, tgt):
        assert api_key == "FAKEKEY"
        assert (src, tgt) == ("vi", "en")
        return "Hello, we begin the meeting."

    monkeypatch.setattr(gemini_client, "translate_text", fake_translate)

    from app.providers.cloud import CloudNMTProvider

    prov = CloudNMTProvider()
    out = asyncio.run(prov.translate("Xin chào", "vi", "en"))
    assert out == "Hello, we begin the meeting."


def test_stt_falls_back_to_mock_without_key(monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.settings, "stt_api_key", None, raising=False)
    from app.providers.cloud import CloudSTTProvider

    prov = CloudSTTProvider()

    async def collect():
        return [r async for r in prov.transcribe(b"anything", "vi")]

    results = asyncio.run(collect())
    assert results[-1].is_final is True
    assert results[-1].text  # mock canned Vietnamese sentence


def test_stt_uses_gemini_with_key(monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.settings, "stt_api_key", "FAKEKEY", raising=False)
    monkeypatch.setattr(config.settings, "gemini_model", "gemini-2.0-flash", raising=False)

    from app.providers import gemini_client

    async def fake_transcribe(api_key, model, audio_b64, mime, source_lang):
        assert api_key == "FAKEKEY"
        assert mime == "audio/wav"
        assert source_lang == "vi"
        return "Xin chào, chúng ta bắt đầu."

    monkeypatch.setattr(gemini_client, "transcribe_audio", fake_transcribe)

    from app.providers.cloud import CloudSTTProvider

    prov = CloudSTTProvider()
    wav = b"RIFF\x00\x00\x00\x00WAVEfmt "

    async def collect():
        return [r async for r in prov.transcribe(wav, "vi")]

    results = asyncio.run(collect())
    assert len(results) == 1
    assert results[0].is_final is True
    assert results[0].text == "Xin chào, chúng ta bắt đầu."
    assert results[0].lang == "vi"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv\Scripts\python.exe -m pytest tests/test_cloud_providers.py -v`
Expected: FAIL — `test_nmt_uses_gemini_with_key` and `test_stt_uses_gemini_with_key` fail with `NotImplementedError` (the enabled branches still raise).

- [ ] **Step 3: Implement the Gemini path in `CloudSTTProvider.transcribe`**

In `app/providers/cloud.py`, replace the enabled-path body (the `TODO(cloud-stt)` block plus the `raise NotImplementedError(...)` and trailing `yield` at lines ~43-57) with:

```python
        # ------------------------------------------------------------------
        # Gemini path: one multimodal generateContent call, one final result.
        # ------------------------------------------------------------------
        import base64

        from . import gemini_client

        audio_b64 = base64.b64encode(audio).decode("ascii")
        mime = gemini_client.sniff_audio_mime(audio)
        text = await gemini_client.transcribe_audio(
            settings.stt_api_key or "",
            settings.gemini_model,
            audio_b64,
            mime,
            source_lang,
        )
        yield STTResult(text=text, lang=source_lang, is_final=True)
```

- [ ] **Step 4: Implement the Gemini path in `CloudNMTProvider.translate`**

Replace the enabled-path body (the `TODO(cloud-nmt)` block plus its `raise NotImplementedError(...)` at lines ~76-82) with:

```python
        # Gemini path: translate via generateContent.
        from . import gemini_client

        return await gemini_client.translate_text(
            settings.nmt_api_key or "",
            settings.gemini_model,
            text,
            source_lang,
            target_lang,
        )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `.venv\Scripts\python.exe -m pytest tests/test_cloud_providers.py -v`
Expected: PASS (4 passed).

- [ ] **Step 6: Run the whole unit suite**

Run: `.venv\Scripts\python.exe -m pytest tests -v`
Expected: PASS (all tests from Tasks 1-3).

- [ ] **Step 7: Commit**

```bash
git add app/providers/cloud.py tests/test_cloud_providers.py
git commit -m "feat(providers): route cloud STT+NMT through Gemini, keep mock fallback"
```

---

### Task 4: `tools/talk_translate.py` end-to-end test client

**Files:**
- Create: `tools/talk_translate.py`

**Interfaces:**
- Consumes: running server at `ws://localhost:8000/ws`; the `session.start`/`audio.chunk`/`nmt.result`/`session.end` wire protocol.
- Produces: a CLI tool (no importable API relied on by other tasks).

*Note:* the mic-capture helpers are duplicated here (not imported from `record_stt.py`) because importing `record_stt` pulls in `faster_whisper`, which is deliberately NOT installed in the minimal cloud subset. The two helpers are ~15 lines and self-contained.

- [ ] **Step 1: Write the tool**

Create `tools/talk_translate.py`:

```python
"""Speak Vietnamese, get an English transcript — end-to-end cloud test.

Records mic audio, sends it over the WebSocket to a server running in `cloud`
mode (Gemini STT + NMT), and prints the Vietnamese transcript plus its English
translation. Audio stays in RAM (no disk write).

Prereqs:
    1) A Google AI Studio key in .env as STT_API_KEY and NMT_API_KEY (same value).
    2) Server running:  uvicorn app.main:app --reload

Usage (from backend/):
    python tools/talk_translate.py                 # press Enter to start/stop
    python tools/talk_translate.py --seconds 6     # fixed 6-second capture
    python tools/talk_translate.py --src vi --tgt en
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import io
import json
import queue
import sys
import threading

import numpy as np
import sounddevice as sd
import soundfile as sf
import websockets

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # Vietnamese on Windows consoles

WS_URL = "ws://localhost:8000/ws"
SAMPLE_RATE = 16000


def record_fixed(seconds: float) -> np.ndarray:
    """Record `seconds` of mono 16 kHz audio and return a float32 array."""
    print(f"● Recording for {seconds:.0f}s... speak Vietnamese now.")
    frames = sd.rec(
        int(seconds * SAMPLE_RATE), samplerate=SAMPLE_RATE, channels=1, dtype="float32"
    )
    sd.wait()
    print("■ Done recording.")
    return frames.reshape(-1)


def record_until_enter() -> np.ndarray:
    """Record until the user presses Enter; return a float32 mono array."""
    input("Press Enter to START recording...")
    chunks: "queue.Queue[np.ndarray]" = queue.Queue()

    def callback(indata, _frames, _time, status) -> None:
        if status:
            print(f"(audio status: {status})", file=sys.stderr)
        chunks.put(indata.copy())

    stop = threading.Event()

    def wait_for_enter() -> None:
        input("● Recording... press Enter to STOP.\n")
        stop.set()

    threading.Thread(target=wait_for_enter, daemon=True).start()
    with sd.InputStream(
        samplerate=SAMPLE_RATE, channels=1, dtype="float32", callback=callback
    ):
        while not stop.is_set():
            sd.sleep(100)

    print("■ Done recording.")
    collected = []
    while not chunks.empty():
        collected.append(chunks.get())
    if not collected:
        return np.zeros(0, dtype="float32")
    return np.concatenate(collected).reshape(-1)


def to_wav_bytes(audio: np.ndarray, sample_rate: int = SAMPLE_RATE) -> bytes:
    """Encode a float32 mono array as 16-bit PCM WAV bytes (in RAM)."""
    buf = io.BytesIO()
    sf.write(buf, audio, sample_rate, format="WAV", subtype="PCM_16")
    return buf.getvalue()


async def run_turn(audio_b64: str, src: str, tgt: str) -> None:
    """Send one push-to-talk turn and print the transcript + translation."""
    async with websockets.connect(WS_URL) as ws:
        await ws.send(json.dumps(
            {"type": "session.start",
             "data": {"mode": "cloud", "sourceLang": src, "targetLang": tgt}}
        ))
        await ws.send(json.dumps(
            {"type": "audio.chunk", "data": {"speaker": "A", "audio": audio_b64}}
        ))

        # Read events until we see nmt.result (success) or error, then stop.
        got_result = False
        for _ in range(8):
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=45.0)
            except asyncio.TimeoutError:
                print("⚠ Timed out waiting for the server. Is it running in cloud mode with a key?")
                break
            msg = json.loads(raw)
            etype, edata = msg.get("type"), msg.get("data", {})
            if etype == "stt.final":
                print(f"\n🎙  Tiếng Việt (STT): {edata.get('text')}")
            elif etype == "nmt.result":
                print(f"🌐  English (NMT):    {edata.get('dstText')}")
                got_result = True
                break
            elif etype == "error":
                print(f"\n❌ error [{edata.get('code')}]: {edata.get('message')}")
                break

        await ws.send(json.dumps({"type": "session.end", "data": {}}))
        if got_result:
            print("\n✅ End-to-end vi→en worked.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Speak Vietnamese -> English transcript (cloud/Gemini).")
    parser.add_argument("--seconds", type=float, default=None,
                        help="Record a fixed number of seconds (default: Enter to start/stop).")
    parser.add_argument("--src", default="vi", help="Source language (default: vi).")
    parser.add_argument("--tgt", default="en", help="Target language (default: en).")
    args = parser.parse_args()

    audio = record_fixed(args.seconds) if args.seconds else record_until_enter()
    if len(audio) / SAMPLE_RATE < 0.2:
        print("No/almost no audio captured. Check your microphone and try again.")
        return

    audio_b64 = base64.b64encode(to_wav_bytes(audio)).decode("ascii")
    asyncio.run(run_turn(audio_b64, args.src, args.tgt))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Byte-compile check (syntax smoke test)**

Run: `.venv\Scripts\python.exe -m py_compile tools/talk_translate.py`
Expected: no output (exit 0) — file parses.

- [ ] **Step 3: Commit**

```bash
git add tools/talk_translate.py
git commit -m "feat(tools): add talk_translate.py end-to-end vi-speech to en-text client"
```

---

### Task 5: Manual end-to-end verification + mock regression

**Files:** none (verification only).

This task needs a real Google AI Studio key and a working microphone, so it is manual. Do it once to confirm the feature.

- [ ] **Step 1: Get a free key and configure `.env`**

Get a key at https://aistudio.google.com/apikey. In `backend/.env` set BOTH to that key:

```
STT_API_KEY=<your-google-ai-studio-key>
NMT_API_KEY=<your-google-ai-studio-key>
```

- [ ] **Step 2: Start the server**

Run: `.venv\Scripts\python.exe -m uvicorn app.main:app --reload`
Expected: `Uvicorn running on http://0.0.0.0:8000`. The startup log should NOT warn that STT/NMT fall back to mock (a warning means the key is not being read).

- [ ] **Step 3: Run the talk tool and speak Vietnamese**

In a second shell (venv active):
Run: `.venv\Scripts\python.exe tools/talk_translate.py --seconds 6`
Speak a Vietnamese sentence, e.g. "Xin chào, hôm nay chúng ta họp về doanh thu."
Expected output (real values, not the canned mock sentence):

```
🎙  Tiếng Việt (STT): Xin chào, hôm nay chúng ta họp về doanh thu.
🌐  English (NMT):    Hello, today we are meeting about revenue.
✅ End-to-end vi→en worked.
```

- [ ] **Step 4: Confirm it is your real speech, not the mock fallback**

The mock canned sentence is exactly "Xin chào, chúng ta bắt đầu cuộc họp về doanh thu quý này." If you see that regardless of what you said, the key is not set — re-check Step 1 and the server log.

- [ ] **Step 5: Mock-mode regression**

Stop the server. Confirm the base pipeline still works unchanged: start the server and run the original smoke test.
Run: `.venv\Scripts\python.exe -m uvicorn app.main:app --reload` then, in another shell, `.venv\Scripts\python.exe tests/test_client.py`
Expected: `stt.partial -> stt.final -> nmt.result -> tts.audio -> metrics` and the final "the base works" line. (`test_client.py` starts its session in `mock` mode, so it is unaffected by the keys.)

- [ ] **Step 6: Final unit-suite run**

Run: `.venv\Scripts\python.exe -m pytest tests -v`
Expected: all unit tests pass.

---

## Notes for the implementer

- If Gemini returns `HTTP 404` for the model, the model name changed — set `GEMINI_MODEL` to a current flash model (e.g. `gemini-flash-latest`) in `.env`; no code change needed.
- If the transcript comes back empty, the audio was too short/quiet — record a few seconds of clear speech.
- Everything except Task 5 is verifiable without a key or a mic (pure unit tests + `py_compile`).
