"""Sentence splitting for buffered TTS (translate/speak whole sentences).

Pure helper: accumulate STT source text across VAD segments, then pull out
COMPLETE sentences so NMT+TTS run on full sentences (smoother voice) while an
unfinished trailing clause stays buffered for the next segment.
"""
from __future__ import annotations

import re

# Mỗi câu: mọi ký tự tới cụm dấu kết câu (. ! ? …) + dấu đóng nháy/ngoặc theo sau.
_SENTENCE = re.compile(r"[^.!?…]*[.!?…]+[\"'”’)\]]*")


def split_sentences(text: str) -> tuple[list[str], str]:
    """Split `text` into (complete_sentences, remainder).

    A complete sentence ends at ./!/?/… (optionally trailing closing quotes or
    brackets). `remainder` is whatever trails the last terminator (unfinished).
    Sentences with no alphanumeric char (pure punctuation) are dropped.
    """
    sentences: list[str] = []
    end = 0
    for m in _SENTENCE.finditer(text):
        s = m.group().strip()
        if any(ch.isalnum() for ch in s):
            sentences.append(s)
        end = m.end()
    remainder = text[end:].strip()
    return sentences, remainder
