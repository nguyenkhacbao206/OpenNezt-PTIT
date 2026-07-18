"""Benchmark END-TO-END latency: audio -> STT -> NMT -> TTS.

For each sentence we synthesize real speech with Piper, resample it to a 16 kHz
mono 16-bit WAV (exactly what a client sends over `audio.chunk`), then run the
full offline provider trio and time every stage. Produces a Markdown report.

Run from backend/:  python tools/bench_e2e_latency.py
"""
from __future__ import annotations

import asyncio
import io
import sys
import time
import wave
from pathlib import Path

import numpy as np
import soundfile as sf

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.providers.factory import build_providers
from app.providers.piper_engine import get_piper_engine
from tools.bench_nmt_latency import EN, VI  # reuse the same 20 + 20 sentences

TARGET_SR = 16000


def _to_16k_wav(wav_bytes: bytes) -> bytes:
    """Decode any-rate WAV -> mono, linearly resample to 16 kHz, re-wrap as WAV."""
    data, sr = sf.read(io.BytesIO(wav_bytes), dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)
    if sr != TARGET_SR:
        n_out = int(round(len(data) * TARGET_SR / sr))
        x_old = np.linspace(0.0, 1.0, num=len(data), endpoint=False)
        x_new = np.linspace(0.0, 1.0, num=n_out, endpoint=False)
        data = np.interp(x_new, x_old, data).astype("float32")
    pcm16 = (np.clip(data, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TARGET_SR)
        w.writeframes(pcm16)
    return buf.getvalue()


async def run_dir(providers, tts_engine, sentences, src, tgt):
    rows = []
    for text in sentences:
        # Build the input audio for this turn from real synthesized speech.
        raw = tts_engine.synthesize(text, src)
        audio = _to_16k_wav(raw)
        audio_ms = len(audio)  # informational (bytes)

        t0 = time.perf_counter()
        # ---- STT ----
        t_stt = time.perf_counter()
        stt_text = ""
        async for r in providers.stt.transcribe(audio, src):
            if r.is_final:
                stt_text = r.text
        stt_ms = (time.perf_counter() - t_stt) * 1000.0

        # ---- NMT ----
        t_nmt = time.perf_counter()
        dst = await providers.nmt.translate(stt_text or text, src, tgt)
        nmt_ms = (time.perf_counter() - t_nmt) * 1000.0

        # ---- TTS ----
        t_tts = time.perf_counter()
        await providers.tts.synthesize(dst, tgt)
        tts_ms = (time.perf_counter() - t_tts) * 1000.0

        e2e_ms = (time.perf_counter() - t0) * 1000.0
        rows.append({
            "src": text, "stt": stt_text, "dst": dst,
            "stt_ms": stt_ms, "nmt_ms": nmt_ms, "tts_ms": tts_ms, "e2e_ms": e2e_ms,
        })
        print(f"[{src}->{tgt}] e2e {e2e_ms:7.1f} ms (stt {stt_ms:6.1f} | nmt {nmt_ms:6.1f} | tts {tts_ms:6.1f}) | {text[:35]}")
    return rows


def agg(rows, key):
    xs = sorted(r[key] for r in rows)
    n = len(xs)
    return {
        "avg": sum(xs) / n, "p50": xs[n // 2],
        "p95": xs[min(n - 1, int(round(0.95 * (n - 1))))],
        "min": xs[0], "max": xs[-1],
    }


async def main():
    from app.core.config import settings
    print("Building offline providers (STT=whisper, NMT=NLLB, TTS=piper)...")
    providers = build_providers("offline")
    tts_engine = get_piper_engine(
        models_dir=settings.piper_models_dir,
        length_scale=settings.piper_length_scale,
    )

    print("Warming up (load STT + NMT + TTS models on first turn)...")
    t0 = time.perf_counter()
    await run_dir(providers, tts_engine, EN[:1], "en", "vi")
    warm_ms = (time.perf_counter() - t0) * 1000.0
    print(f"Warmup (incl. all model loads): {warm_ms:.1f} ms\n")

    en_rows = await run_dir(providers, tts_engine, EN, "en", "vi")
    vi_rows = await run_dir(providers, tts_engine, VI, "vi", "en")
    all_rows = en_rows + vi_rows

    md = []
    md.append("# End-to-End Latency Benchmark Report\n")
    md.append("Full pipeline **audio → STT → NMT → TTS** on the offline stack, timed per turn.")
    md.append("Input audio is real Piper-synthesized speech resampled to 16 kHz mono WAV")
    md.append("(the exact format a client sends via `audio.chunk`).\n")
    md.append("## Configuration\n")
    md.append(f"- **STT:** Faster-Whisper `{settings.stt_model_size}` — `{settings.stt_device}`/`{settings.stt_compute_type}` (beam 5, VAD on)")
    md.append(f"- **NMT:** NLLB-200 distilled 600M (CT2) — `{settings.offline_nmt_device}`/`{settings.offline_nmt_compute_type}`, beam {settings.offline_nmt_beam_final}")
    md.append(f"- **TTS:** Piper (`{settings.piper_models_dir}`), length_scale {settings.piper_length_scale}")
    md.append(f"- **Dataset:** {len(EN)} EN→VI + {len(VI)} VI→EN business-meeting sentences")
    md.append(f"- **Warmup (all model loads + 1st turn):** {warm_ms:.1f} ms  _(excluded from stats)_\n")

    md.append("## Summary — average latency per turn (warmed)\n")
    md.append("| Direction | N | STT avg | NMT avg | TTS avg | **E2E avg** | E2E P50 | E2E P95 | E2E max |")
    md.append("|---|---|---|---|---|---|---|---|---|")
    for name, rows in (("EN → VI", en_rows), ("VI → EN", vi_rows), ("**Overall**", all_rows)):
        s = agg(rows, "stt_ms"); n = agg(rows, "nmt_ms"); t = agg(rows, "tts_ms"); e = agg(rows, "e2e_ms")
        md.append(f"| {name} | {len(rows)} | {s['avg']:.0f} | {n['avg']:.0f} | {t['avg']:.0f} | "
                  f"**{e['avg']:.0f}** | {e['p50']:.0f} | {e['p95']:.0f} | {e['max']:.0f} |")
    md.append("")
    md.append("_All figures in milliseconds. STT + NMT + TTS ≈ E2E (minor overhead excluded)._\n")

    for title, rows in (("EN → VI", en_rows), ("VI → EN", vi_rows)):
        md.append(f"## Detail: {title}\n")
        md.append("| # | E2E (ms) | STT (ms) | NMT (ms) | TTS (ms) | STT transcript | Translation |")
        md.append("|---|---|---|---|---|---|---|")
        for i, r in enumerate(rows, 1):
            stt = r["stt"].replace("|", "\\|")
            dst = r["dst"].replace("|", "\\|")
            md.append(f"| {i} | {r['e2e_ms']:.0f} | {r['stt_ms']:.0f} | {r['nmt_ms']:.0f} | {r['tts_ms']:.0f} | {stt} | {dst} |")
        md.append("")

    out_path = Path(__file__).resolve().parent.parent / "docs" / "e2e_latency_report.md"
    out_path.parent.mkdir(exist_ok=True)
    out_path.write_text("\n".join(md), encoding="utf-8")
    e = agg(all_rows, "e2e_ms")
    print(f"\nReport written to: {out_path}")
    print(f"Overall E2E avg latency: {e['avg']:.0f} ms")


if __name__ == "__main__":
    asyncio.run(main())
