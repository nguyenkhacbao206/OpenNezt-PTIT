"""Shared sherpa-onnx STT engine (per-language Zipformer transducers).

Mirrors `whisper_engine.py`, but instead of one multilingual Whisper model it
loads a SEPARATE offline transducer model per language, because the k2/sherpa
ecosystem ships one independent model per language (no multilingual model):

  * Vietnamese -> gipformer   (https://github.com/ggroup-ai-lab/gipformer)
  * English    -> sherpa-onnx zipformer-en (https://github.com/k2-fsa/sherpa-onnx)

Both are Zipformer transducers and are driven through the exact same
`sherpa_onnx.OfflineRecognizer.from_transducer(...)` API, so adding a new
(low-resource) language is just: drop its model folder in and add a lang code.

Layout expected on disk (see tools/download_sherpa_models.py):

    <models_dir>/
        vi/   encoder-*.onnx  decoder-*.onnx  joiner-*.onnx  tokens.txt
        en/   encoder-*.onnx  decoder-*.onnx  joiner-*.onnx  tokens.txt

The concrete file names differ between models (gipformer uses
`encoder-epoch-35-avg-6.onnx`, the English model a different epoch), so the
engine DISCOVERS the encoder/decoder/joiner/tokens by pattern rather than
hard-coding names. Recognizers are loaded lazily and cached per language.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np

log = logging.getLogger("providers.sherpa")

# gipformer / sherpa-onnx zipformer transducers operate on 16 kHz mono audio
# with 80-dim filterbank features.
SAMPLE_RATE = 16000
FEATURE_DIM = 80


@dataclass
class Transcription:
    """Full transcription result (segment-less: sherpa returns plain text)."""

    text: str
    language: str


def _pick(files: list[Path], use_int8: bool) -> Path:
    """Choose the int8 or fp32 variant from a list of matching .onnx files.

    A model folder may contain both `encoder-...onnx` and `encoder-...int8.onnx`.
    Prefer the requested precision, but fall back to whatever exists so a folder
    that only ships one variant still works.
    """
    int8 = [f for f in files if ".int8." in f.name]
    fp32 = [f for f in files if ".int8." not in f.name]
    preferred = (int8 or fp32) if use_int8 else (fp32 or int8)
    return sorted(preferred)[0]


def _discover(model_dir: Path, use_int8: bool) -> dict[str, str]:
    """Locate encoder/decoder/joiner/tokens inside a language model folder.

    Raises FileNotFoundError with an actionable message if the folder or any of
    the four required files is missing, so misconfiguration fails loudly at load
    time rather than producing empty transcripts.
    """
    if not model_dir.is_dir():
        raise FileNotFoundError(
            f"sherpa model folder not found: {model_dir}. "
            "Run `python tools/download_sherpa_models.py` or set SHERPA_MODELS_DIR."
        )

    # rglob so a downloaded model that keeps a nested folder still works.
    onnx = list(model_dir.rglob("*.onnx"))
    found: dict[str, str] = {}
    for part in ("encoder", "decoder", "joiner"):
        matches = [f for f in onnx if part in f.name]
        if not matches:
            raise FileNotFoundError(
                f"No *{part}*.onnx found under {model_dir} (has: {[f.name for f in onnx]})."
            )
        found[part] = str(_pick(matches, use_int8))

    tokens = next(iter(sorted(model_dir.rglob("tokens.txt"))), None)
    if tokens is None:
        raise FileNotFoundError(f"tokens.txt not found under {model_dir}.")
    found["tokens"] = str(tokens)
    return found


class SherpaEngine:
    """Lazy, per-language sherpa-onnx offline recognizer holder.

    Args:
        models_dir: Root folder containing one subfolder per language code.
        use_int8: Prefer the int8-quantized ONNX variant when available.
        num_threads: ONNX Runtime intra-op threads per recognizer.
        decoding_method: "greedy_search" (fast) or "modified_beam_search".
    """

    def __init__(
        self,
        models_dir: str = "models",
        use_int8: bool = False,
        num_threads: int = 2,
        decoding_method: str = "greedy_search",
    ) -> None:
        self.models_dir = Path(models_dir)
        self.use_int8 = use_int8
        self.num_threads = num_threads
        self.decoding_method = decoding_method
        # lang code -> sherpa_onnx.OfflineRecognizer, loaded on first use.
        self._recognizers: dict[str, object] = {}

    @staticmethod
    def _norm_lang(lang: str | None) -> str:
        """Normalize a language hint to a bare 2-letter code (e.g. 'vi')."""
        if not lang or lang == "auto":
            # Per-language models cannot auto-detect; the caller must choose one.
            raise ValueError(
                "sherpa STT needs an explicit source language (e.g. 'vi' or 'en'); "
                "'auto' is unsupported because each language is a separate model."
            )
        return lang.strip().lower().split("-")[0]

    def load(self, lang: str) -> object:
        """Load (or return cached) the recognizer for `lang`."""
        code = self._norm_lang(lang)
        rec = self._recognizers.get(code)
        if rec is not None:
            return rec

        # Imported here so the rest of the app doesn't require sherpa-onnx.
        import sherpa_onnx

        paths = _discover(self.models_dir / code, self.use_int8)
        log.info(
            "Loading sherpa-onnx %s recognizer (int8=%s, threads=%d) from %s ...",
            code,
            self.use_int8,
            self.num_threads,
            self.models_dir / code,
        )
        rec = sherpa_onnx.OfflineRecognizer.from_transducer(
            encoder=paths["encoder"],
            decoder=paths["decoder"],
            joiner=paths["joiner"],
            tokens=paths["tokens"],
            num_threads=self.num_threads,
            sample_rate=SAMPLE_RATE,
            feature_dim=FEATURE_DIM,
            decoding_method=self.decoding_method,
        )
        self._recognizers[code] = rec
        log.info("sherpa-onnx %s recognizer loaded.", code)
        return rec

    def transcribe_array(
        self, audio: np.ndarray, language: str, sample_rate: int = SAMPLE_RATE
    ) -> Transcription:
        """Transcribe a float32 mono waveform.

        Args:
            audio: 1-D float32 numpy array in [-1, 1].
            language: "vi" / "en" / ... — selects which model to run.
            sample_rate: The waveform's actual sample rate. sherpa-onnx resamples
                to 16 kHz internally, so any rate is accepted.
        """
        rec = self.load(language)
        code = self._norm_lang(language)

        stream = rec.create_stream()
        stream.accept_waveform(sample_rate, np.asarray(audio, dtype="float32"))
        rec.decode_streams([stream])
        return Transcription(text=stream.result.text.strip(), language=code)


@lru_cache
def get_sherpa_engine(
    models_dir: str = "models",
    use_int8: bool = False,
    num_threads: int = 2,
    decoding_method: str = "greedy_search",
) -> SherpaEngine:
    """Return a cached SherpaEngine so recognizers are shared/loaded once."""
    return SherpaEngine(
        models_dir=models_dir,
        use_int8=use_int8,
        num_threads=num_threads,
        decoding_method=decoding_method,
    )
