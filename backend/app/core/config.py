"""Application configuration loaded from environment / .env via pydantic-settings.

No secret is hard-coded here. All API keys and endpoints are read from the
environment. If a cloud key is missing, the CloudProvider transparently falls
back to the MockProvider (see providers/cloud.py).
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for the translator backend.

    Every field can be overridden with an environment variable of the same
    (case-insensitive) name, or via a `.env` file. See `.env.example`.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Server -----------------------------------------------------------
    host: str = "0.0.0.0"
    port: int = 8000

    # Default pipeline mode when a session does not specify one.
    # One of: "mock" | "cloud" | "offline".
    default_mode: str = "mock"

    # CORS allow-list. "*" is fine for local hackathon dev.
    cors_origins: str = "*"

    # --- Offline STT engine selection ------------------------------------
    # Which local STT engine `mode=offline` uses:
    #   "whisper" -> Faster-Whisper (one multilingual model, auto-detect)
    #   "sherpa"  -> sherpa-onnx per-language Zipformer (gipformer VI + zipformer EN)
    stt_engine: str = "whisper"

    # --- sherpa-onnx STT (used when stt_engine == "sherpa") --------------
    # Root folder holding one subfolder per language code: <dir>/vi, <dir>/en, ...
    sherpa_models_dir: str = "models"
    # Prefer the int8-quantized ONNX variant when a model ships both.
    sherpa_use_int8: bool = False
    # ONNX Runtime intra-op threads per recognizer.
    sherpa_num_threads: int = 2
    # "greedy_search" (fast) or "modified_beam_search" (slightly better WER).
    sherpa_decoding_method: str = "greedy_search"

    # --- TTS engine ------------------------------------------------------
    # TTS is decoupled from the session mode: the SAME voice engine is used
    # whether STT/NMT run in cloud or offline. Options:
    #   "edge"  -> edge-tts online neural voices (free, no key, real VN + EN);
    #              server-side audio -> works on web AND mobile clients. (default)
    #   "piper" -> local Piper voices (needs models); "mock" -> silent clip.
    tts_engine: str = "edge"
    # edge-tts voices (see `edge-tts --list-voices`).
    edge_voice_vi: str = "vi-VN-HoaiMyNeural"
    edge_voice_en: str = "en-US-AriaNeural"
    # Root folder holding one subfolder per language: <dir>/vi, <dir>/en, ...
    # Each folder contains a Piper voice pair: <name>.onnx + <name>.onnx.json
    # (fetch with tools/download_piper_models.py).
    piper_models_dir: str = "models/tts"
    # Speaking rate. >1.0 = slower, <1.0 = faster. Applied to every language.
    piper_length_scale: float = 1.0

    # --- Cloud TTS (e.g. ElevenLabs, Google TTS, Azure, ...) --------------
    tts_api_key: str | None = None
    tts_api_url: str | None = None

    # --- Groq (console.groq.com) — free tier STT (Whisper) + NMT (LLM) ---
    # `groq_api_key` is the shared/default key. To split rate limits, set a
    # separate key per stage (STT vs NMT); each falls back to groq_api_key.
    groq_api_key: str | None = None
    groq_stt_api_key: str | None = None
    groq_nmt_api_key: str | None = None
    # OpenAI-compatible Groq base URL (rarely changed).
    groq_api_url: str = "https://api.groq.com/openai/v1"
    # Whisper model for speech-to-text.
    groq_stt_model: str = "whisper-large-v3"
    # Chat model used to translate the transcript (both directions).
    groq_nmt_model: str = "llama-3.3-70b-versatile"

    # --- STT hallucination guard -----------------------------------------
    # Windows quieter than this normalized RMS (0..1), or shorter than this many
    # ms, are treated as silence and NEVER sent to Whisper (which hallucinates on
    # silence). Raise stt_silence_rms if quiet speech is being dropped; lower it
    # if silence still produces phantom text.
    stt_silence_rms: float = 0.006
    stt_min_speech_ms: int = 300

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse the comma-separated CORS origins into a list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings singleton."""
    return Settings()


settings = get_settings()
