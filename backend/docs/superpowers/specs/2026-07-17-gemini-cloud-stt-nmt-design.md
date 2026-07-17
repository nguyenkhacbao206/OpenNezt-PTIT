# Design: Real Vietnamese speech → English transcript via Gemini (cloud mode)

**Date:** 2026-07-17
**Status:** Approved (pending written-spec review)
**Scope:** Wire the `cloud` provider trio's STT + NMT to Google Gemini (Google AI
Studio) so a user can speak Vietnamese and receive a real English transcript
end-to-end. TTS stays mock.

## Problem

The app advertises "nói tiếng Việt → transcript tiếng Anh", but no real
Vietnamese→English path exists today:

- `mock` mode: STT returns a canned Vietnamese sentence (ignores real audio);
  NMT only echoes `[vi->en] <text>`. No real transcription or translation.
- `cloud` mode: STT/NMT keys are blank, so both `CloudSTTProvider` and
  `CloudNMTProvider` fall back to mock.
- `offline` mode: STT is real (Whisper/sherpa) but `OfflineNMTProvider.translate`
  raises `NotImplementedError` (NLLB not plugged in).

The factory selects **one** trio per session (`mock`/`cloud`/`offline`), so STT
and NMT cannot be mixed across trios. To test real voice → English we need real
STT **and** real NMT in the same trio. `cloud` mode is that trio.

## Approach

Use **Gemini 2.0 Flash** (multimodal, accepts inline audio, has a free tier) for
both stages via one Google AI Studio API key:

- `CloudSTTProvider` → Gemini: audio bytes → Vietnamese text.
- `CloudNMTProvider` → Gemini: Vietnamese text → English text.

One free key, no billing card, one HTTP dependency (`httpx`). No local models,
so no torch/whisper/sherpa wheels needed (avoids Python 3.13 / Windows wheel
pain).

**Trade-off accepted:** cloud mode sends the user's audio to Google. This differs
from the local/zero-retention goal of `offline` mode, but is inherent to cloud
mode and was chosen deliberately.

## Components

### 1. `app/providers/gemini_client.py` (new)

A small async helper over the Gemini REST `generateContent` endpoint, shared by
the STT and NMT providers.

- Endpoint:
  `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}`
- `async transcribe_audio(api_key, model, audio_b64, mime, source_lang) -> str`
  - Parts: a text instruction + `inline_data` (mime + base64 audio).
  - Prompt: transcribe the spoken `source_lang` audio verbatim; return ONLY the
    transcript text, no commentary/markdown.
- `async translate_text(api_key, model, text, source_lang, target_lang) -> str`
  - Prompt: translate `text` from `source_lang` to `target_lang`; return ONLY
    the translation, no quotes/commentary.
- Uses `httpx.AsyncClient` with a timeout. Non-2xx or empty candidates → raise a
  `RuntimeError` with a concise message (bad key, quota, safety block).
- Reads nothing from `settings` directly — callers pass key/model in, keeping the
  helper pure and testable.

### 2. `app/providers/cloud.py` (modified)

- `CloudSTTProvider`
  - Enabled when `settings.stt_api_key` is set (unchanged gate).
  - When enabled: sniff mime from the audio bytes (RIFF/`WAVE` → `audio/wav`,
    `OggS` → `audio/ogg`, else default `audio/wav`), base64-encode, call
    `gemini_client.transcribe_audio(...)`, and `yield` exactly one final
    `STTResult(text=..., lang=source_lang, is_final=True)`. No streaming partials.
  - When disabled: existing mock fallback (unchanged).
  - Model comes from `settings.gemini_model`.
- `CloudNMTProvider`
  - Enabled when `settings.nmt_api_key` is set (unchanged gate).
  - When enabled: call `gemini_client.translate_text(...)` and return the string.
  - When disabled: existing mock fallback (unchanged).
- `CloudTTSProvider`: unchanged (mock fallback).

### 3. `app/core/config.py` + `.env` + `.env.example` (modified)

- Reuse existing `stt_api_key` / `nmt_api_key` — the user puts the **same** Gemini
  key in both `STT_API_KEY` and `NMT_API_KEY`.
- Add `gemini_model: str = "gemini-2.0-flash"` (env `GEMINI_MODEL`), shared by
  both providers.
- `.env` / `.env.example`: document that for Gemini you set `STT_API_KEY` and
  `NMT_API_KEY` to the same Google AI Studio key, plus optional `GEMINI_MODEL`.

### 4. `requirements.txt` (modified)

- Uncomment / add `httpx>=0.27` (already reserved in the file for cloud calls).

### 5. `tools/talk_translate.py` (new)

Standalone end-to-end test client — the deliverable that proves the feature.

- Records mic audio (reusing `record_stt.py`'s fixed-seconds and Enter-to-stop
  helpers) into a 16 kHz mono float32 array, encodes it as a 16-bit PCM WAV in
  RAM (no disk write), base64-encodes it.
- Connects to `ws://localhost:8000/ws`, sends
  `session.start {mode:"cloud", sourceLang:"vi", targetLang:"en"}`, then one
  `audio.chunk`, and prints `stt.final` (Vietnamese) and `nmt.result.dstText`
  (English). Prints any `error` event verbatim. Ends with `session.end`.
- CLI: `--seconds N` (default: Enter-to-stop), `--src vi --tgt en` overridable.
- Forces UTF-8 stdout for Vietnamese on Windows consoles.

## Data flow

```
mic → float32 16k mono (RAM) → WAV bytes (RAM) → base64
  → WS audio.chunk
  → handler._on_audio_chunk
    → CloudSTTProvider.transcribe → gemini_client.transcribe_audio → stt.final (vi)
    → CloudNMTProvider.translate  → gemini_client.translate_text   → nmt.result (en)
  → client prints vi + en
```

## Error handling

- Gemini bad key / quota / safety block / network → helper raises `RuntimeError`;
  the handler's existing try/except emits `error` (`stt_failed` / `nmt_failed`,
  `canFallback=true`) and keeps the socket alive. The test client prints it.
- No key set → providers fall back to mock (documented; the transcript will be
  the canned sample, not the user's voice).
- Empty transcript → handler already emits `stt_empty`.

## Zero-retention

- Audio and text stay in RAM only (`SessionState` buffers, `record`-style capture
  in the tool); no disk writes in the server path. Gemini calls transmit audio to
  Google over TLS — an accepted property of cloud mode, called out to the user.

## Testing / install

- Install a minimal subset into `.venv` (Python 3.13):
  `fastapi uvicorn[standard] pydantic-settings websockets httpx sounddevice soundfile numpy`.
  No torch/whisper/sherpa needed for the Gemini cloud path.
- Manual end-to-end run:
  1. Get a free key at https://aistudio.google.com/apikey.
  2. Put it in `.env` as `STT_API_KEY` and `NMT_API_KEY` (same value).
  3. `uvicorn app.main:app --reload`
  4. `python tools/talk_translate.py --seconds 6` → speak Vietnamese → see the
     Vietnamese transcript and its English translation.
- Regression: `python tests/test_client.py` against a `mock`-mode server still
  shows `stt.partial → stt.final → nmt.result → tts.audio → metrics`.

## Out of scope (YAGNI)

- Real cloud TTS (English audio playback) — stays mock.
- Offline NLLB NMT.
- Streaming STT partials from Gemini.
- Frontend integration (browser mic capture / mime handling).
- Other vendors (Google Translate v2, DeepL, OpenAI).
