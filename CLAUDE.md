# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Real-Time Vietnamese ⇄ English business-meeting translator. Two independent apps
that talk over a **single WebSocket** (`ws://localhost:8000/ws`) using a
`{"type": <event>, "data": {...}}` envelope in both directions:

- `backend/` — FastAPI + WebSocket STT → NMT → TTS pipeline (Python). Cloud mode
  runs on **Groq** (Whisper STT + Llama NMT).
- `frontend/` — **Expo / React Native (mobile)** app. `backend/README.md` is the
  authoritative spec for the wire protocol and event list.

> **Status the code doesn't show:** the frontend was recently switched from a
> Vite web SPA to the Expo/RN mobile base. The web translator UI (mic → WS →
> live captions) is **not yet ported to React Native** — it lives in git history
> only. The backend WebSocket is ready; a new RN client must do audio capture
> (e.g. `expo-av`) and speak the same protocol.

## Commands

Backend (from `backend/`, Windows venv shown):
```bash
python -m venv .venv && .venv\Scripts\Activate.ps1   # or: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload          # http://localhost:8000, WS at /ws, test UI at /
python tools/check_groq_key.py         # verify a Groq key works (STT+NMT via one gsk_ key)
python tools/test_stream_client.py --wav file.wav --src en --tgt vi   # streaming WS test
python tools/talk_translate.py --mode cloud --src vi --tgt en         # mic → server → transcript+translation
python tools/record_stt.py             # mic → real Faster-Whisper STT → Markdown (no server)
```
There is no pytest suite: `tests/test_client.py` is a manual end-to-end WS client.
Run one-off backend checks with an in-process `fastapi.testclient.TestClient`
websocket (this is how the pipeline is verified without a live server).

Frontend (from `frontend/`):
```bash
npm install
npm start            # expo start (a=Android, i=iOS, w=web); or npm run android|ios|web
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src/**/*.{ts,tsx}
```
`frontend/claude.md` is a strict, mandatory architecture/style constitution for
all frontend work (Expo/RN, NativeWind, Zustand slices, layered imports) — read
it before touching `frontend/`. This root file does not repeat its rules.

## Backend architecture — the one pattern that matters

**Modular provider pattern.** Each pipeline stage (STT / NMT / TTS) is an
abstract contract in `app/providers/base.py`. Concrete trios implement it:

- `mock.py` — works instantly, no models/keys. Default mode.
- `cloud.py` — **Groq only** (Whisper STT + Llama chat NMT). Falls back to the
  matching mock provider when the key is missing. (Gemini has been removed.)
- `offline.py` — local models. STT is wired (Faster-Whisper via
  `whisper_engine.py`, or sherpa-onnx via `sherpa.py`/`sherpa_engine.py`,
  selected by `STT_ENGINE`); offline NMT/TTS are still `NotImplementedError` stubs.

The active trio is chosen by session `mode` (`mock`/`cloud`/`offline`) in
`app/providers/factory.py` — **the only file that knows concrete provider
classes exist.** `app/ws/handler.py` (transport + per-turn orchestration) and
`app/main.py` (`/ws` lifecycle) talk only to the abstract base classes. To
add/swap a real model, implement the base-class methods in a provider and wire
it in `factory.py`. Never import a concrete provider into the handler.

TTS is decoupled from the STT/NMT mode (`build_tts()` in `factory.py`, chosen by
`TTS_ENGINE`), so a cloud session can still get local Piper voices.

`STTProvider.transcribe` is an **async generator**: it yields partial
`STTResult`s (`is_final=False` → `stt.partial`) then exactly one final
(`is_final=True` → `stt.final`).

### Groq cloud (`cloud.py` + `groq_client.py`)
- STT = `whisper-large-v3` (multipart `/audio/transcriptions`); NMT =
  `llama-3.3-70b-versatile` (`/chat/completions`), bidirectional.
- **Split rate limits:** `GROQ_STT_API_KEY` / `GROQ_NMT_API_KEY` each fall back to
  the shared `GROQ_API_KEY`. `groq_client.py`'s request/response builders are
  pure functions; only `_transcribe`/`_chat` do I/O.

### Two live streaming paths (both end with an authoritative final)
- **Audio path** — client streams growing audio windows as `audio.partial`
  (backend runs STT+NMT → `stt.partial` + `nmt.partial`); `audio.chunk` is the
  final lock → `stt.final` + `nmt.result`. `_on_audio_partial` is best-effort
  (swallows errors). Clients should coalesce (≤1 partial in flight) to avoid Groq
  rate limits.
- **Text path** — client already has the transcript (e.g. browser STT) and sends
  `text.partial` / `text.final`; the backend only **translates** (no STT) →
  `nmt.partial` / `nmt.result`.

### Turn flow (`_on_audio_chunk`)
`audio.chunk` → STT (times `sttMs`) → NMT (times `nmtMs`, then `apply_glossary`)
→ optional TTS (only if `session.tts_on`, which defaults **False**) → `metrics`
(`e2eMs`). Each stage is wrapped in try/except: a failure emits an `error` event
with `canFallback` and keeps the connection alive; a TTS failure never aborts the
turn.

### Two invariants — do not break
- **Zero retention.** All audio/text lives in RAM only (`core/session.py`
  buffers). `SessionState.cleanup()` runs in the `/ws` `finally` block on
  `session.end` *or* disconnect. Never write audio to disk in the server path.
- **Config via `core/config.py`** (pydantic-settings, `.env`). No hard-coded
  keys; read settings through the `settings` singleton, not `os.environ`.

Mode can change mid-session via `config.update {mode}`; providers rebuild without
reconnecting (`SessionState.set_mode`). Business glossary (`core/glossary.py`) is
applied as whole-word replacement to NMT output, selected per-session.

`backend/static/index.html` is a self-contained browser client for manually
driving the WS (served at `/`), useful when there is no RN client yet.

## Cross-cutting notes
- Language handling: the sherpa engine has one model per language, so the source
  language must be explicit — `auto` detection only works with the Whisper engine.
- Windows consoles are cp1252; tools call `sys.stdout.reconfigure(encoding="utf-8")`
  to print Vietnamese. When running ad-hoc Python that prints Vietnamese, set
  `PYTHONIOENCODING=utf-8`.
