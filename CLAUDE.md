# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Real-Time Vietnamese ⇄ English business-meeting translator. Two independent apps
that talk over a **single WebSocket** (`ws://<host>:8000/ws`) using a
`{"type": <event>, "data": {...}}` envelope in both directions:

- `backend/` — FastAPI + WebSocket STT → NMT → TTS pipeline (Python). Cloud mode
  runs on **Groq** (Whisper STT + Llama NMT).
- `frontend/` — **Expo / React Native (mobile)** app. The 8-screen **RTT** flow
  (`src/screens/rtt/Demo1..Demo8`) is the live translator UI.

**Primary product = LAN 1:1 pairing ("chat nội bộ").** Two devices point at the
*same* backend on the LAN, discover each other in a lobby, pair into a 1:1 room,
and translate for each other: when A speaks (langA), B receives the translation
(langB) **and** its TTS audio, and vice-versa. See "Lobby + 1:1 room pairing"
below. The single-connection self-loop (speak → get your own translation back)
still works for the `/app` browser console and any client that never sends
`hello`. Design spec: `docs/superpowers/specs/2026-07-18-lan-lobby-translation-rooms-design.md`.

> To run two real machines: start the backend with `--host 0.0.0.0`, find the
> host LAN IPv4 (`ipconfig`), open the firewall for TCP 8000, and set the WS URL
> on both clients to `ws://<lan-ip>:8000/ws` (Demo1 → "Cài đặt backend"). Browser
> mic capture only works on `localhost`/https, so use Expo Go on phones or run
> Expo Web on each machine's own localhost (only the WS URL needs the LAN IP).

## Commands

Backend (from `backend/`, Windows venv shown):
```bash
python -m venv .venv && .venv\Scripts\Activate.ps1   # or: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload          # http://localhost:8000; WS /ws; health JSON at /; test console at /app
uvicorn app.main:app --host 0.0.0.0 --port 8000   # reachable by other LAN devices (pairing)
python tools/check_groq_key.py         # verify a Groq key works (STT+NMT via one gsk_ key)
python tools/test_stream_client.py --wav file.wav --src en --tgt vi   # streaming WS test
python tools/talk_translate.py --mode cloud --src vi --tgt en         # mic → server → transcript+translation
python tools/record_stt.py             # mic → real Faster-Whisper STT → Markdown (no server)
```
There is no pytest suite: `tests/test_client.py` is a manual end-to-end WS client.
Run one-off backend checks with an in-process `fastapi.testclient.TestClient`
websocket for the **single-connection** pipeline. **Do NOT use TestClient to
verify pairing/routing** — it cannot deliver cross-connection sends (a handler
sending to another client's socket is silently dropped). Verify multi-client
routing against a **live uvicorn** server with two real `websockets` clients.

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

Pairing-specific frontend facts (protocol-spanning, not in `frontend/claude.md`):
`store/slices/translatorSlice.ts` owns one `TranslatorSocket` plus the lobby/room
state (`devices`, `room`, `incomingInvite`, `myClientId`) and drives the flow —
Demo1 `enterLobby`→`hello`, Demo2 lobby+`invite`, Demo3 `accept`, Demo4 Meeting
(listener view), Demo6 push-to-talk (`useMeetingMic`, sends `audio.partial`/`chunk`).
Because translation routes to the peer, the **speaker records its own words from
`stt.final`** (`turn.mine=true`); the **listener records the peer's from
`nmt.result`** (`mine=false`). `services/audioPlayback.ts` is platform-split: web
plays a `data:` URI via `Audio` (expo-file-system is a no-op on web), native
writes a temp file for expo-audio.

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
`TTS_ENGINE`, **default `edge`**): `edge` → `tts_edge.py` (Microsoft edge-tts
online neural voices — free, no key, real Vietnamese voice `vi-VN-HoaiMyNeural`);
`piper` → local Piper; else Mock. So a cloud STT/NMT session still gets edge-tts
audio. `session.tts_on` still defaults **False**; the RN client enables it via
`config.update {ttsOn}` (the pairing flow does this on `room.joined`).

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
→ optional TTS (only if `session.tts_on`) → `metrics` (`e2eMs`). Each stage is
wrapped in try/except: a failure emits an `error` event with `canFallback` and
keeps the connection alive; a TTS failure never aborts the turn.

### STT hallucination guard (`core/audio_utils.py`)
Whisper hallucinates canned text ("Thank you.", "Let's go!", "Ghiền Mì Gõ") on
silence. `CloudSTTProvider.transcribe` calls `is_silence(wav)` (normalized RMS +
duration vs `settings.stt_silence_rms` / `stt_min_speech_ms`) and **never sends a
silent/too-short window to Groq** — it yields an empty final instead.
`looks_like_hallucination()` drops exact canned phrases as a backstop. An empty
final is skipped silently (no `error`, nothing stored), so silence never pollutes
the transcript/history. The STT `language` is forced to the session source lang
(no auto-detect) — a device must speak its configured language.

## Lobby + 1:1 room pairing (LAN) — `app/ws/rooms.py`

`ConnectionManager` (a process-global singleton, RAM only) is the registry the
self-loop never had. `app/main.py` passes it into `dispatch`; on disconnect the
`/ws` `finally` calls `manager.unregister()` (notifies peer + rebroadcasts lobby)
**before** `session.cleanup()`. `SessionState` gains only `client_id`.

- **Events (added to `handler.dispatch`)** — C→S: `hello{name,lang}`,
  `invite{toClientId}`, `invite.accept{fromClientId}`, `invite.decline`,
  `room.leave`. S→C: `welcome{clientId}`, `lobby{devices:[{clientId,name,lang,busy}]}`,
  `invite.incoming`, `invite.declined`, `room.joined{roomId,peer}`, `room.closed{reason}`.
- **`hello`** registers the connection (server-assigned `client_id`) and sets
  `session.source_lang`. **`form_room`** pairs two clients, then calls
  `session.start(default_mode, ownLang, peerLang)` for **both** sessions so each
  translates its own language into the peer's — this is why the app needs no
  explicit `session.start`.
- **Routing is the core** (`handler._emit(..., to_peer=True)`): in a room,
  `nmt.partial` / `nmt.result` / `tts.audio` go to the **peer**; `stt.*` +
  `metrics` stay on the **speaker**. With no peer (`client_id` unset → the `/app`
  console), everything falls back to `send(ws, ...)` — the self-loop, unchanged.
  So the speaker sees only their own transcript; the listener gets the
  translation + audio.

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
driving the WS (served at **`/app`**; `/` is a health JSON). It never sends
`hello`, so it exercises the self-loop path, not pairing.

## Cross-cutting notes
- Language handling: the sherpa engine has one model per language, so the source
  language must be explicit — `auto` detection only works with the Whisper engine.
- Windows consoles are cp1252; tools call `sys.stdout.reconfigure(encoding="utf-8")`
  to print Vietnamese. When running ad-hoc Python that prints Vietnamese, set
  `PYTHONIOENCODING=utf-8`.
