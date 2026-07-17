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
