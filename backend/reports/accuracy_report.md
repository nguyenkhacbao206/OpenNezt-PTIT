# Translation Accuracy Report — On-Prem (Offline) Mode

**System:** Visi — real-time Vietnamese ⇄ English business-meeting translator
**Mode measured:** Offline / on-prem (local models, no cloud, no API key, nothing leaves the machine)
**Date:** 2026-07-19

---

## TL;DR

Running **fully on-prem on a laptop CPU**, the Vietnamese ⇄ English pipeline produces
meaning-preserving business translation at **chrF++ 62.8** (in-domain business set) and
**chrF++ 60.7** (FLORES-200, the standard public benchmark) — with **zero data leaving the device**.

| Test set | Direction | chrF++ ↑ | BLEU ↑ |
|---|---:|---:|---:|
| **Business** (24 sentences, in-domain) | vi→en | 66.1 | 47.2 |
| | en→vi | 59.3 | 42.2 |
| | **Overall** | **62.8** | **45.6** |
| **FLORES-200** (80 sentences, general/citable) | vi→en | 61.5 | 41.1 |
| | en→vi | 59.8 | 42.5 |
| | **Overall** | **60.7** | **42.3** |

> chrF++ is 0–100, higher is better. For the Vietnamese–English pair, ~50–60 = good,
> **>60 = strong**, >70 = excellent. Both test sets land in the strong range on-device.

---

## Why we measure this

Translation accuracy is **30% of the challenge rubric** — the single heaviest criterion.
Because our differentiator is **on-prem, private operation**, we evaluate the *offline* pipeline:
local open models only, no third-party cloud, so a confidential meeting never leaves the room.

## Setup

| | |
|---|---|
| **Device** | Intel Core i5-12450H (12th Gen), 16 GB RAM, **CPU inference** |
| **GPU** | NVIDIA RTX 3050 Ti present but **unused** (CUDA driver too old on this box; a working GPU would improve both speed and quality headroom) |
| **NMT model** | NLLB-200-distilled-600M via CTranslate2, **int8**, beam=4 — local, open weights |
| **Tool** | `tools/measure_accuracy.py` |
| **Metric** | **chrF++** (sacrebleu, `word_order=2`) — character n-gram F-score, tokenization-free, well-suited to Vietnamese. BLEU (flores200 tokenizer) reported as a secondary signal. |

**Method.** Each source sentence is sent over the production WebSocket **text path**
(`text.final → nmt.result`), which exercises **only the NMT stage** — this isolates
translation quality from any speech-recognition noise. The machine translation is then
scored against a human reference translation.

**Test sets.**
- **Business** — 24 in-domain sentences (meetings, contracts, pricing, delivery, KPIs),
  with human reference translations; 12 per direction. Reflects the actual use case.
- **FLORES-200** — Meta's standard, human-translated evaluation set (devtest split),
  40 sentence pairs × 2 directions = 80 items. General domain, **citable and reproducible**.

---

## Results

### Business set (in-domain)

| Direction | chrF++ | BLEU |
|---|---:|---:|
| vi→en | 66.1 | 47.2 |
| en→vi | 59.3 | 42.2 |
| **Overall** | **62.8** | **45.6** |

### FLORES-200 (public benchmark)

| Direction | chrF++ | BLEU |
|---|---:|---:|
| vi→en | 61.5 | 41.1 |
| en→vi | 59.8 | 42.5 |
| **Overall** | **60.7** | **42.3** |

Direction into **English scores higher** than into Vietnamese, as expected for this model.
Scores are consistent across an in-domain set and an independent public benchmark — the
system generalises, it is not tuned to our own sentences.

### Terminology glossary — a consistency tool, not an accuracy booster

We ran every set with the business glossary **ON** and **OFF**. The measured difference was
**Δ chrF++ ≈ 0.0 in every direction**. In practice the model already translates common
business terms correctly, so the glossary's term-substitution step rarely fires.

**Honest takeaway:** the glossary is a **guarantee of agreed terminology for house-specific
terms** (product names, internal jargon a general model can't know) — *not* a general quality
lift. It should be presented as an optional consistency/enforcement feature.

---

## Context — cloud vs. offline (the privacy ↔ accuracy trade-off)

For reference, the **same business set** through the cloud path (Groq, Llama-3.3-70B) scores
**chrF++ 74.8**. This quantifies the trade-off:

| Path | Business chrF++ | Data locality |
|---|---:|---|
| Cloud (Llama-3.3-70B) | 74.8 | leaves the LAN to Groq |
| **Offline (NLLB-600M)** | **62.8** | **100% on-prem** |

Offline keeps every word on the device at roughly a **12-point chrF cost** — still firmly in
the "strong" range, and appropriate for confidential meetings. On a working GPU, a larger
local model (NLLB-1.3B/3.3B or SeaLLM) would narrow this gap.

---

## Reproduce

```bash
# 1) Start the offline server (local NLLB, no key)
OFFLINE_NMT_MODEL_DIR=models/nllb-200-distilled-600M-ct2-int8 \
  uvicorn app.main:app --port 8000

# 2) Business set (with glossary on/off comparison)
python tools/measure_accuracy.py --testset data/accuracy_business.json --mode offline --baseline

# 3) FLORES-200 (build the set once from the public tarball, then measure)
python tools/make_flores_testset.py --limit 40 --split devtest
python tools/measure_accuracy.py --testset data/flores_vi_en.json --mode offline
```

## Caveats

- chrF/BLEU compare against a **single** reference; many valid translations exist, so absolute
  scores *understate* real quality. A human or LLM adequacy rating would complement these.
- Sample sizes (24 / 80 sentences) are **indicative**, not a large-scale evaluation.
- These numbers measure **translation (NMT) only**; speech-recognition (STT) accuracy is a
  separate axis and is deliberately excluded here.
- Offline quality is bounded by the 600M model on CPU; larger local models on a GPU raise it.
