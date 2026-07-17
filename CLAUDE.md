# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Real-Time Vietnamese ⇄ English business-meeting translator. Two independent apps:

- `backend/` — FastAPI + WebSocket STT → NMT → TTS pipeline (Python).
- `frontend/` — React 18 + TypeScript + Vite + Tailwind SPA.

They communicate over a single WebSocket (`ws://localhost:8000/ws`) using a
`{"type": <event>, "data": {...}}` envelope in both directions. The backend
`README.md` is the authoritative spec for the wire protocol and event list.

`frontend/claude.md` (also `frontend/CLAUDE.md`) is a strict, mandatory
architecture/style constitution for all frontend work — read it before touching
`frontend/`. This root file does not repeat its rules.

## Commands

Backend (from `backend/`):
```bash
python -m venv .venv && .venv\Scripts\Activate.ps1   # PowerShell; or: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload          # serves http://localhost:8000, WS at /ws
python tests/test_client.py            # sample WS client; prints every event of one full turn
python tools/record_stt.py             # mic → real STT → Markdown transcript (standalone, no server)
python tools/download_sherpa_models.py # fetch sherpa-onnx VI/EN models into models/<lang>/
```
There is no pytest suite; `tests/test_client.py` is a manual end-to-end client run against a live server.

Frontend (from `frontend/`):
```bash
npm install
npm run dev          # Vite dev server, http://localhost:3000
npm run build        # tsc -b + vite build → dist/
npm run lint         # eslint, --max-warnings 0
npm run type-check   # tsc --noEmit
```

## Backend architecture — the one pattern that matters

**Modular provider pattern.** Each pipeline stage (STT / NMT / TTS) is an
abstract contract in `app/providers/base.py`. Three concrete trios implement it:

- `mock.py` — works instantly, no models/keys. Default mode.
- `cloud.py` — external-API stubs; reads keys from `.env`, **falls back to mock if a key is missing**.
- `offline.py` — local models. STT engine is config-selectable via `STT_ENGINE`:
  `whisper` (Faster-Whisper, one multilingual model) or `sherpa` (sherpa-onnx
  per-language Zipformer: gipformer VI + zipformer EN — see `sherpa.py` / `sherpa_engine.py`).

The active trio is chosen by session `mode` (`mock`/`cloud`/`offline`) in
`app/providers/factory.py` — **the only file that knows concrete provider
classes exist.** `app/ws/handler.py` (transport + per-turn orchestration) and
`app/main.py` (app + `/ws` lifecycle) talk only to the abstract base classes.

Consequence: to add/swap a real model, implement the base-class methods in a
provider and wire it in `factory.py`. Never import a concrete provider into the
handler or add mode-specific branching there. Insertion points are marked
`TODO(cloud-stt|offline-nmt|...)`.

`STTProvider.transcribe` is an async generator: it yields partial `STTResult`s
(`is_final=False` → `stt.partial`) then exactly one final (`is_final=True` → `stt.final`).

### Turn flow (`_on_audio_chunk` in handler.py)
`audio.chunk` → STT (times `sttMs`) → NMT (times `nmtMs`, then `apply_glossary`)
→ optional TTS (only if `session.tts_on`) → `metrics` (`e2eMs`). Each stage is
wrapped in try/except: a failure emits an `error` event with `canFallback` and
keeps the connection alive; a TTS failure never aborts the turn.

### Two invariants — do not break
- **Zero retention.** All audio/text lives in RAM only (`core/session.py`
  buffers). `SessionState.cleanup()` runs in the `/ws` `finally` block on
  `session.end` *or* disconnect. Never write audio to disk in the server path.
  (`tools/record_stt.py` writes a Markdown transcript, but keeps audio in RAM only.)
- **Config via `core/config.py`** (pydantic-settings, `.env`). No hard-coded
  keys; every setting is an env var. Read settings through the `settings`
  singleton, not `os.environ`.

Business glossary: `core/glossary.py` holds `{term: translation}` dicts applied
as whole-word replacement to NMT output; selected per-session via `config.update`.

## Cross-cutting notes
- Language handling: the sherpa engine has one model per language, so the source
  language must be explicit — `auto` detection only works with the Whisper engine.
- Mode can change mid-session via `config.update {mode}`; providers rebuild
  without reconnecting (`SessionState.set_mode`).
