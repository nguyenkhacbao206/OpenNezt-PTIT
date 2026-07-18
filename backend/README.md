# Real-Time Vietnamese ⇄ English Business Meeting Translator — Backend (BASE)

A FastAPI + WebSocket backend for live VI⇄EN meeting translation. It runs
**end-to-end right now** with mock providers so the frontend can integrate
immediately. Real STT/NMT/TTS models drop in later behind the same interfaces —
**no WebSocket/UI code changes required**.

## Architecture — Modular Provider Pattern

Each stage (STT / NMT / TTS) is a provider implementing a shared abstract base
class. Three implementations per stage:

| Provider          | Behaviour                                                                 |
|-------------------|---------------------------------------------------------------------------|
| `MockProvider`    | Works instantly. STT returns sample text, NMT echoes with a prefix, TTS returns a silent base64 WAV. |
| `CloudProvider`   | Stub calling an external API; reads keys from env. **Falls back to Mock if the key is missing.** |
| `OfflineProvider` | Empty stub (`NotImplementedError`) reserved for Faster-Whisper / NLLB / Piper. |

The active trio is chosen by the session `mode` (`mock` / `cloud` / `offline`)
in `providers/factory.py`. That factory is the only place aware of concrete
classes.

```
backend/
  app/
    main.py                 # FastAPI app + /ws route + connection lifecycle
    ws/handler.py           # event parsing, pipeline orchestration, responses
    providers/
      base.py               # STTProvider / NMTProvider / TTSProvider (abstract)
      mock.py               # working fake providers
      cloud.py              # API stubs (env keys, mock fallback)
      offline.py            # local-model stubs (Whisper STT wired; NLLB/Piper TODO)
      sherpa.py             # sherpa-onnx STT provider (gipformer VI + zipformer EN)
      sherpa_engine.py      # per-language sherpa-onnx recognizer loader
      whisper_engine.py     # shared Faster-Whisper engine
      factory.py            # mode -> provider trio
    core/
      session.py            # SessionState + zero-retention cleanup
      metrics.py            # perf_counter latency (sttMs / nmtMs / e2eMs)
      glossary.py           # business term injection
      config.py             # pydantic-settings (.env)
  tests/test_client.py      # sample WS client, prints every event
  requirements.txt
  .env.example
  README.md
```

## Run it

```bash
cd backend
python -m venv .venv
# Windows PowerShell:  .venv\Scripts\Activate.ps1
# macOS/Linux:         source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env      # optional; mock mode needs no keys
uvicorn app.main:app --reload
```

Server: `http://localhost:8000` (health at `/`), WebSocket at `ws://localhost:8000/ws`.

## Test it

With the server running, in another shell:

```bash
python tests/test_client.py
```

You should see the full turn:

```
stt.partial → stt.final → nmt.result → tts.audio → metrics
```

## Test microphone → real STT → Markdown

Standalone tool to verify the audio-capture + real STT path (Faster-Whisper),
no server/frontend needed. First run downloads the Whisper model (cached after).

```bash
cd backend
pip install -r requirements.txt

# Interactive: press Enter to start, Enter again to stop, then speak
python tools/record_stt.py

# Or fixed duration + force Vietnamese, better model
python tools/record_stt.py --seconds 8 --lang vi --model small

# Transcribe an existing audio file (no mic needed)
python tools/record_stt.py --wav path/to/audio.wav --lang en
```

Output: a Markdown transcript at `transcripts/transcript-<timestamp>.md` (or
`--out <path>`) with the full text, detected language, model, and timed segments.
Options: `--lang vi|en|auto`, `--model tiny|base|small|medium`. Audio stays in
RAM only — no audio file is written to disk.

## Sherpa-onnx STT — gipformer (VI) + zipformer (EN)

An alternative offline STT engine using **k2/sherpa-onnx** Zipformer transducers,
one **independent model per language** (there is no multilingual model):

- **Vietnamese** → [gipformer](https://github.com/ggroup-ai-lab/gipformer)
  (65M params, robust on noisy/telephony audio, N/C/S accents)
- **English** → [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) zipformer-en

It runs behind the same `STTProvider` contract, so NMT/TTS and the WS/UI code
are untouched. Because each language is its own model, the source language must
be explicit (no `auto`) — which fits the "each machine has a fixed spoken
language" meeting flow.

```bash
cd backend
pip install -r requirements.txt          # installs sherpa-onnx + huggingface_hub

# 1) Download the models into models/vi and models/en
python tools/download_sherpa_models.py            # both, or --langs vi

# 2a) Try it straight from the mic (VI model)
python tools/record_stt.py --engine sherpa --lang vi

# 2b) Or use it in the server pipeline: set in .env then run uvicorn
#     STT_ENGINE=sherpa
#     DEFAULT_MODE=offline
```

Config (`.env`): `STT_ENGINE=sherpa|whisper`, `SHERPA_MODELS_DIR`,
`SHERPA_USE_INT8` (smaller/faster), `SHERPA_NUM_THREADS`, `SHERPA_DECODING_METHOD`
(`greedy_search` | `modified_beam_search`). Adding a new low-resource language =
drop its sherpa-onnx transducer folder under `models/<code>/` and pass
`--lang <code>` (the engine auto-discovers encoder/decoder/joiner/tokens).

## Text-to-Speech — Piper (real local voices)

The translated text is spoken back with **Piper** offline neural voices, one
**independent voice per language** (VI + EN). TTS is **decoupled from the
session mode**: the same voice engine runs whether STT/NMT are `cloud` (Groq)
or `offline`, so a cloud session still returns real audio. The clip is
always synthesized from the exact translated text (`dstText`) in the target
language, so the voice matches the text by construction.

```bash
cd backend
pip install -r requirements.txt          # installs piper-tts (bundles espeak-ng)

# 1) Download the voices into models/tts/vi and models/tts/en
python tools/download_piper_models.py            # both, or --langs vi

# 2) It is on by default (TTS_ENGINE=piper). Turn it off per session with
#    config.update { "ttsOn": false }, or globally with TTS_ENGINE=mock.
```

The **voice follows the text, not the session's target language**: the engine
detects whether the text to speak is Vietnamese or English (`detect_lang`) and
picks that voice — so Vietnamese output is always read by the VI voice and
English by the EN voice, even if the `targetLang` hint disagrees.

The engine reads **exactly the text**: input is normalized first (markdown,
emoji and stray symbols are stripped so they are never spoken), then split at
punctuation so each clause gets a controlled pause — `,`≈275ms, `;`≈425ms,
`. ! ?`≈650ms, line break≈950ms, paragraph≈1250ms (`PAUSE_MS` in
`app/providers/piper_engine.py`). `PIPER_LENGTH_SCALE` sets the speaking rate.

Hear it without the server:

```bash
python tools/tts_say.py --demo                       # writes demo_en.wav + demo_vi.wav
python tools/tts_say.py --lang vi --text "Xin chào, bắt đầu họp."
```

Config (`.env`): `TTS_ENGINE=piper|mock`, `PIPER_MODELS_DIR` (default
`models/tts`), `PIPER_LENGTH_SCALE` (>1 slower, <1 faster). Adding a new
language = drop its Piper voice pair (`<name>.onnx` + `<name>.onnx.json`) under
`models/tts/<code>/` — the engine auto-discovers it. Voices come from
[rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices).

## WebSocket contract

Envelope: `{"type": <event>, "data": {...}}` in both directions.

**Client → Server**

| Event           | `data`                                     |
|-----------------|--------------------------------------------|
| `session.start` | `{ mode, sourceLang, targetLang }`         |
| `audio.chunk`   | `{ speaker, audio }` (audio = base64)      |
| `config.update` | `{ mode?, ttsOn?, glossaryId? }`           |
| `session.end`   | `{}`                                       |

**Server → Client**

| Event         | `data`                                   |
|---------------|------------------------------------------|
| `stt.partial` | `{ speaker, text }`                      |
| `stt.final`   | `{ speaker, text, lang }`                |
| `nmt.result`  | `{ speaker, srcText, dstText }`          |
| `tts.audio`   | `{ speaker, audio }` (base64, if ttsOn)  |
| `metrics`     | `{ sttMs, nmtMs, e2eMs }`                 |
| `error`       | `{ code, message, canFallback }`         |

Ack events (`session.started`, `config.updated`, `session.ended`) confirm
control messages.

### Turn flow

`audio.chunk` → STT (measure `sttMs`, emit `stt.partial`/`stt.final`) → NMT
(measure `nmtMs`, apply glossary, emit `nmt.result`) → if `ttsOn`: TTS (emit
`tts.audio`) → emit `metrics` (`e2eMs` measured from chunk receipt via
`time.perf_counter`).

## Switching providers (no handler changes)

- **Per session:** send `session.start` with `mode: "cloud" | "offline" | "mock"`.
- **Mid-session:** send `config.update` with `{ "mode": "cloud" }` — providers
  rebuild without reconnecting.
- **Default:** set `DEFAULT_MODE` in `.env`.

## Plugging in real models

All insertion points are marked with `TODO(...)` comments.

- **Cloud APIs** → `app/providers/cloud.py`: fill the `TODO(cloud-stt|nmt|tts)`
  blocks with your vendor HTTP calls (OpenAI/Google/DeepL/ElevenLabs/Azure).
  Add `httpx` to `requirements.txt`. Keys come from `.env` via `config.py`.
- **Faster-Whisper (STT)** → `OfflineSTTProvider` in `app/providers/offline.py`
  (`TODO(offline-stt)`): load the model once in `__init__`, yield partial then
  final `STTResult`s from `transcribe`.
- **NLLB (NMT)** → `OfflineNMTProvider` (`TODO(offline-nmt)`): return the
  translated string from `translate`.
- **Piper (TTS)** → already wired in `OfflineTTSProvider` via the shared
  `PiperEngine` (`app/providers/piper_engine.py`); used for cloud + offline
  modes. See "Text-to-Speech — Piper" above.

Uncomment the corresponding lines in `requirements.txt`.

## Business Glossary

`app/core/glossary.py` holds sample glossaries (`biz-default`, `finance`) as
`{term: preferred_translation}` dicts. Whole-word, case-insensitive replacement
is applied to NMT output. Select one via `config.update` `{ "glossaryId": "finance" }`.
Back it with a DB later without touching the pipeline.

## Privacy — zero retention

- All session state is in RAM only; **no audio is ever written to disk**.
- On `session.end` **or** disconnect, `SessionState.cleanup()` wipes every
  audio/text buffer (guaranteed in the connection's `finally` block).

## Error handling & fallback

Each pipeline stage is wrapped in `try/except`. A provider failure emits
`error` with `canFallback: true` (a hint for the UI to switch mode) and the
server stays up. A TTS failure never aborts the turn.

## Out of scope for this BASE

No real model downloads, WebRTC, remote rooms, database, or auth — this is a
clean, runnable end-to-end skeleton built to extend.
