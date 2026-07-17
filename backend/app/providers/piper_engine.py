"""Shared Piper TTS engine (per-language ONNX voices).

Mirrors `sherpa_engine.py`: one INDEPENDENT voice model per language, loaded
lazily and cached, so a turn synthesized in the target language always uses the
right voice. Piper ships one voice per (language, speaker) — there is no
multilingual voice — so the layout on disk is one folder per language code:

    <models_dir>/
        vi/   vi_VN-vais1000-medium.onnx   vi_VN-vais1000-medium.onnx.json
        en/   en_US-lessac-medium.onnx     en_US-lessac-medium.onnx.json

(fetch with tools/download_piper_models.py). The concrete voice file names
differ per language, so the engine DISCOVERS the `.onnx` + its `.onnx.json`
config by pattern rather than hard-coding names.

Reading "exactly like the text":
  * Input is normalized first (`_normalize`) — markdown/emoji/stray symbols are
    stripped so the voice never reads junk characters out loud (the usual cause
    of it "saying random things").
  * The text is split at punctuation (`_segment`) and each segment is
    synthesized separately, with a controlled SILENCE inserted after it
    (PAUSE_MS) so commas/periods/newlines get natural, tunable pauses — matching
    how the sentence is written rather than one flat run-on.
"""
from __future__ import annotations

import io
import logging
import re
import unicodedata
import wave
from functools import lru_cache
from pathlib import Path

log = logging.getLogger("providers.piper")

# Pause length (milliseconds) inserted AFTER a segment, keyed by the punctuation
# that ended it. Values are midpoints of the requested ranges.
PAUSE_MS: dict[str, int] = {
    ",": 275,   # 200–350 ms
    ";": 425,   # 350–500 ms
    ".": 650,   # 500–800 ms
    "!": 650,
    "?": 650,
    "…": 650,
    "newline": 950,     # single line break: 700–1200 ms
    "paragraph": 1250,  # blank line between paragraphs: 1000–1500 ms
}
# Sentence/clause punctuation that ends a segment (kept in the segment text so
# the phonemizer still produces the right intonation).
_CLAUSE_RE = re.compile(r"[^,;.!?…\n]+[,;.!?…]*")

# Vietnamese-specific accented letters. Any of these in the text is a strong,
# near-certain signal the text is Vietnamese (English never uses them).
_VN_CHARS = set(
    "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩ"
    "òóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ"
)
# Fallback word lists for UNACCENTED text (rare) — common function words.
_VI_WORDS = {
    "khong", "la", "cua", "va", "co", "cho", "nhung", "mot", "nay", "duoc",
    "toi", "ban", "chung", "ta", "cuoc", "hop", "voi", "cac", "nguoi",
    "trong", "den", "khi", "se", "da", "ma", "ve", "hay", "rat",
}
_EN_WORDS = {
    "the", "is", "are", "and", "of", "to", "a", "in", "we", "this", "that",
    "for", "you", "it", "on", "with", "will", "have", "our", "be", "as",
}


def detect_lang(text: str, default: str = "en") -> str:
    """Detect whether `text` is Vietnamese or English, to pick the right voice.

    Accented Vietnamese is unambiguous (has letters English never uses). For the
    rare fully-unaccented case, fall back to a common-word overlap vote, then to
    `default`. Only 'vi' / 'en' are returned since those are the only voices.
    """
    t = (text or "").lower()
    if any(c in _VN_CHARS for c in t):
        return "vi"
    words = set(re.findall(r"[a-z]+", t))
    vi, en = len(words & _VI_WORDS), len(words & _EN_WORDS)
    if vi > en:
        return "vi"
    if en > vi:
        return "en"
    return default if default in ("vi", "en") else "en"


def _discover(model_dir: Path) -> tuple[str, str]:
    """Locate the (voice .onnx, config .onnx.json) pair in a language folder."""
    if not model_dir.is_dir():
        raise FileNotFoundError(
            f"Piper voice folder not found: {model_dir}. "
            "Run `python tools/download_piper_models.py` or set PIPER_MODELS_DIR."
        )
    onnx = [f for f in model_dir.rglob("*.onnx") if not f.name.endswith(".onnx.json")]
    if not onnx:
        raise FileNotFoundError(
            f"No Piper *.onnx voice found under {model_dir}. "
            "Run `python tools/download_piper_models.py`."
        )
    model = sorted(onnx)[0]
    config = model.with_suffix(model.suffix + ".json")
    if not config.is_file():
        jsons = sorted(model_dir.rglob("*.json"))
        if not jsons:
            raise FileNotFoundError(
                f"No Piper config .onnx.json found next to {model.name} under {model_dir}."
            )
        config = jsons[0]
    return str(model), str(config)


def _normalize(text: str) -> str:
    """Clean text so the voice reads words, not markup, and never garbles.

    Keeps letters (incl. Vietnamese diacritics via NFC), digits and sentence
    punctuation; drops markdown emphasis, code fences, bullet glyphs, emoji and
    other symbols that a TTS engine would otherwise try to pronounce.
    """
    text = unicodedata.normalize("NFC", text)
    # Strip markdown emphasis / headings / code / quote markers.
    text = re.sub(r"[*_`#>|~]+", " ", text)
    # Turn bullet/list markers into nothing.
    text = re.sub(r"^\s*[-•·]\s+", "", text, flags=re.MULTILINE)
    # Drop emoji and pictographic symbols (BMP + astral) but keep normal text.
    text = re.sub(
        r"[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF←-⇿⌀-⏿]",
        " ",
        text,
    )
    # Collapse spaces/tabs but preserve newlines (they drive paragraph pauses).
    text = re.sub(r"[ \t\f\v]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    # Drop spaces before punctuation left behind by stripped markup.
    text = re.sub(r"\s+([,;.!?…])", r"\1", text)
    return text.strip()


def _segment(text: str) -> list[tuple[str, int]]:
    """Split normalized text into (segment_text, pause_ms_after) pairs.

    Paragraph breaks (blank lines) > single newlines > clause punctuation, each
    mapped to its PAUSE_MS. Punctuation stays attached to the segment it ends so
    intonation is preserved; the pause is added as trailing silence.
    """
    out: list[tuple[str, int]] = []
    paragraphs = re.split(r"\n[ \t]*\n+", text)
    for pi, para in enumerate(paragraphs):
        lines = para.split("\n")
        for li, line in enumerate(lines):
            clauses = _CLAUSE_RE.findall(line)
            for ci, clause in enumerate(clauses):
                seg = clause.strip()
                if not seg:
                    continue
                is_last_clause = ci == len(clauses) - 1
                is_last_line = li == len(lines) - 1
                if not is_last_clause:
                    pause = PAUSE_MS.get(seg[-1], PAUSE_MS["."]) if seg[-1] in PAUSE_MS else PAUSE_MS["."]
                elif not is_last_line:
                    pause = PAUSE_MS["newline"]
                elif pi != len(paragraphs) - 1:
                    pause = PAUSE_MS["paragraph"]
                else:
                    pause = 0  # end of text
                out.append((seg, pause))
    return out


class PiperEngine:
    """Lazy, per-language Piper voice holder.

    Args:
        models_dir: Root folder containing one subfolder per language code.
        length_scale: Speaking rate (>1.0 slower, <1.0 faster).
    """

    def __init__(self, models_dir: str = "models/tts", length_scale: float = 1.0) -> None:
        self.models_dir = Path(models_dir)
        self.length_scale = length_scale
        # lang code -> piper.PiperVoice, loaded on first use.
        self._voices: dict[str, object] = {}

    @staticmethod
    def _norm_lang(lang: str | None) -> str:
        """Normalize a language hint to a bare 2-letter code (e.g. 'vi')."""
        if not lang or lang == "auto":
            raise ValueError(
                "Piper TTS needs an explicit language (e.g. 'vi' or 'en'); "
                "each language is a separate voice model."
            )
        return lang.strip().lower().split("-")[0]

    def load(self, lang: str) -> object:
        """Load (or return cached) the Piper voice for `lang`."""
        code = self._norm_lang(lang)
        voice = self._voices.get(code)
        if voice is not None:
            return voice

        try:
            from piper import PiperVoice
        except ImportError:  # older builds expose it under piper.voice
            from piper.voice import PiperVoice  # type: ignore[no-redef]

        model, config = _discover(self.models_dir / code)
        log.info("Loading Piper %s voice from %s ...", code, model)
        voice = PiperVoice.load(model, config_path=config)
        self._voices[code] = voice
        log.info("Piper %s voice loaded.", code)
        return voice

    def _syn_config(self) -> object | None:
        """Build a SynthesisConfig carrying length_scale (None on old builds)."""
        try:
            from piper import SynthesisConfig
        except ImportError:
            return None
        return SynthesisConfig(length_scale=self.length_scale)

    def synthesize(self, text: str, lang: str) -> bytes:
        """Synthesize `text` to 16-bit PCM WAV bytes.

        The VOICE is chosen from the language actually detected in the text
        (`detect_lang`), not the `lang` hint — so Vietnamese output is spoken by
        the Vietnamese voice and English output by the English voice, regardless
        of what the session's target language claims. `lang` is only a fallback
        when detection is inconclusive (e.g. digits/symbols only).

        Reads exactly the (normalized) text, sentence by sentence, inserting the
        configured pause after each punctuation mark / line / paragraph.
        """
        clean = _normalize(text or "")
        fallback = self._norm_lang(lang) if lang and lang != "auto" else "en"
        voice_lang = detect_lang(clean, default=fallback)
        log.info("Piper TTS: hint=%s detected=%s", lang, voice_lang)
        voice = self.load(voice_lang)
        sample_rate = int(getattr(voice.config, "sample_rate", 22050))  # type: ignore[attr-defined]
        syn = self._syn_config()

        segments = _segment(clean)
        if not segments:
            return _wrap_wav(b"", sample_rate)

        pcm = bytearray()
        for seg_text, pause_ms in segments:
            for chunk in voice.synthesize(seg_text, syn):  # type: ignore[attr-defined]
                pcm += chunk.audio_int16_bytes
            if pause_ms > 0:
                pcm += _silence_pcm(pause_ms, sample_rate)
        return _wrap_wav(bytes(pcm), sample_rate)


def _silence_pcm(duration_ms: int, sample_rate: int) -> bytes:
    """Raw 16-bit mono PCM silence of `duration_ms` at `sample_rate`."""
    return b"\x00\x00" * int(sample_rate * duration_ms / 1000)


def _wrap_wav(pcm: bytes, sample_rate: int) -> bytes:
    """Wrap raw 16-bit mono PCM in a WAV container and return the bytes."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm or b"\x00\x00" * int(sample_rate * 0.12))
    return buf.getvalue()


@lru_cache
def get_piper_engine(models_dir: str = "models/tts", length_scale: float = 1.0) -> PiperEngine:
    """Return a cached PiperEngine so voices are shared/loaded once."""
    return PiperEngine(models_dir=models_dir, length_scale=length_scale)
