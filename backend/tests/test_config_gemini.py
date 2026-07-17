"""Unit test: the Gemini model setting exists with a sane default."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_gemini_model_default():
    from app.core.config import Settings

    s = Settings(_env_file=None)  # ignore any local .env
    assert s.gemini_model == "gemini-2.0-flash"
