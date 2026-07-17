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

    # --- Cloud STT (e.g. OpenAI Whisper API, Google STT, ...) -------------
    stt_api_key: str | None = None
    stt_api_url: str | None = None

    # --- Cloud NMT (e.g. Google Translate, DeepL, OpenAI, ...) ------------
    nmt_api_key: str | None = None
    nmt_api_url: str | None = None

    # --- Cloud TTS (e.g. ElevenLabs, Google TTS, Azure, ...) --------------
    tts_api_key: str | None = None
    tts_api_url: str | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse the comma-separated CORS origins into a list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings singleton."""
    return Settings()


settings = get_settings()
