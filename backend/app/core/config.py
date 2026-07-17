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

    # --- Cloud STT (e.g. OpenAI Whisper API, Google STT, ...) -------------
    stt_api_key: str | None = None
    stt_api_url: str | None = None

    # --- Cloud NMT (e.g. Google Translate, DeepL, OpenAI, ...) ------------
    nmt_api_key: str | None = None
    nmt_api_url: str | None = None

    # --- Cloud TTS (e.g. ElevenLabs, Google TTS, Azure, ...) --------------
    tts_api_key: str | None = None
    tts_api_url: str | None = None

    # --- Gemini (Google AI Studio) model for cloud STT + NMT -------------
    # The SAME Google AI Studio key goes in both stt_api_key and nmt_api_key.
    # This selects the model used for both transcription and translation.
    gemini_model: str = "gemini-2.0-flash"

    # --- Cloud backend selection -----------------------------------------
    # Which vendor `mode=cloud` uses: "groq" (default, generous free tier) or
    # "gemini". Both do STT + bidirectional NMT; providers fall back to mock
    # when the selected vendor's key is missing.
    cloud_provider: str = "groq"

    # --- Groq (console.groq.com) — free tier STT (Whisper) + NMT (LLM) ---
    # One key `gsk_...` powers both transcription and translation.
    groq_api_key: str | None = None
    # OpenAI-compatible Groq base URL (rarely changed).
    groq_api_url: str = "https://api.groq.com/openai/v1"
    # Whisper model for speech-to-text.
    groq_stt_model: str = "whisper-large-v3"
    # Chat model used to translate the transcript (both directions).
    groq_nmt_model: str = "llama-3.3-70b-versatile"

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse the comma-separated CORS origins into a list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings singleton."""
    return Settings()


settings = get_settings()
