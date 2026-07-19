"""Đo ĐỘ CHÍNH XÁC dịch (chrF++ / BLEU) qua pipeline WebSocket.

Cho slide "Translation Accuracy" (30% — nặng nhất). Gửi từng câu nguồn qua
đường TEXT (`text.final` → `nmt.result`, tức ĐO THUẦN NMT, bỏ qua STT), so bản
dịch máy với bản dịch CHUẨN trong bộ test bằng:
  • chrF++  — F-score n-gram ký tự (chuẩn ngành, hợp tiếng Việt, KHÔNG cần torch)
  • BLEU    — n-gram từ (phụ; kém tin hơn cho tiếng Việt)

Cờ `--baseline` dịch LẠI với glossary TẮT để đo glossary giúp bao nhiêu chrF
(đúng câu chuyện "glossary khoá thuật ngữ" trên slide).

CẦN server đang chạy ở mode có dịch thật (KHÔNG mock):
    uvicorn app.main:app --reload        # cloud cần GROQ_API_KEY

Cách dùng (từ backend/, đã bật venv):
    python tools/measure_accuracy.py --mode cloud                       # bộ business mặc định
    python tools/measure_accuracy.py --mode cloud --baseline            # + so glossary on/off
    python tools/measure_accuracy.py --testset data/flores_vi_en.json --mode offline
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time

import websockets

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


async def send(ws, event: str, data: dict) -> None:
    await ws.send(json.dumps({"type": event, "data": data}))


async def recv_next(ws, timeout: float):
    try:
        raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
    except asyncio.TimeoutError:
        return None
    msg = json.loads(raw)
    return msg.get("type"), msg.get("data", {})


def _is_rate_limit(data: dict) -> bool:
    m = str(data.get("message") or "").lower()
    return "429" in m or "rate limit" in m or "rate_limit" in m


async def translate_one(ws, src: str, speaker: str, timeout: float) -> str | None:
    """Dịch một câu qua đường TEXT (chỉ NMT). '__RL__' nếu dính rate limit."""
    await send(ws, "text.final", {"speaker": speaker, "text": src})
    dst = None
    deadline = time.perf_counter() + timeout
    while time.perf_counter() < deadline:
        ev = await recv_next(ws, max(0.1, deadline - time.perf_counter()))
        if ev is None:
            break
        etype, data = ev
        if etype == "nmt.result":
            dst = data.get("dstText", "")
        elif etype == "metrics":
            break  # metrics là event cuối lượt text
        elif etype == "error":
            return "__RL__" if _is_rate_limit(data) else None
    return dst


async def translate_group(ws, items, mode, src_lang, tgt_lang, glossary,
                          speaker, timeout, gap, rl_wait) -> list[str]:
    """session.start theo chiều dịch + set glossary, rồi dịch cả nhóm."""
    await send(ws, "session.start",
               {"mode": mode, "sourceLang": src_lang, "targetLang": tgt_lang})
    await recv_next(ws, 5)
    await send(ws, "config.update", {"glossaryId": glossary, "ttsOn": False})
    await recv_next(ws, 5)

    hyps: list[str] = []
    for i, it in enumerate(items, 1):
        while True:
            r = await translate_one(ws, it["src"], speaker, timeout)
            if r == "__RL__":
                print(f"    ⏳ 429 — chờ {rl_wait:.0f}s...")
                await asyncio.sleep(rl_wait)
                continue
            hyps.append(r or "")
            break
        if i == 1:
            print(f"    vd: {it['src'][:40]}  →  {(hyps[-1] or '')[:48]}")
        await asyncio.sleep(gap)
    return hyps


def score(hyps: list[str], refs: list[str]) -> tuple[float, float]:
    """Trả (chrF++, BLEU). chrF++ = word_order 2; BLEU token flores200 (đa ngữ)."""
    import sacrebleu

    chrf = sacrebleu.corpus_chrf(hyps, [refs], word_order=2).score
    try:
        bleu = sacrebleu.corpus_bleu(hyps, [refs], tokenize="flores200").score
    except Exception:
        bleu = sacrebleu.corpus_bleu(hyps, [refs]).score
    return chrf, bleu


async def run(args) -> None:
    with open(args.testset, encoding="utf-8") as f:
        testset = json.load(f)
    if args.limit:
        testset = testset[: args.limit]

    # nhóm theo chiều dịch
    groups: dict[tuple[str, str], list[dict]] = {}
    for it in testset:
        groups.setdefault((it["srcLang"], it["tgtLang"]), []).append(it)

    if args.mode == "mock":
        print("⛔ mode=mock chỉ echo, KHÔNG dịch thật → điểm vô nghĩa. Dùng cloud/offline.\n")
    print(f"Kết nối {args.ws} | mode={args.mode} | testset={args.testset} "
          f"| n={len(testset)} | baseline={'on' if args.baseline else 'off'}\n")

    results = {}
    async with websockets.connect(args.ws, max_size=None) as ws:
        for (sl, tl), items in groups.items():
            print(f"[{sl}->{tl}]  {len(items)} câu  (glossary={args.glossary})")
            hyps = await translate_group(ws, items, args.mode, sl, tl, args.glossary,
                                         args.speaker, args.timeout, args.gap, args.rl_wait)
            refs = [it["ref"] for it in items]
            entry = {"hyps": hyps, "refs": refs}
            if args.baseline:
                print(f"[{sl}->{tl}]  baseline (glossary TẮT)...")
                entry["base"] = await translate_group(ws, items, args.mode, sl, tl, None,
                                                       args.speaker, args.timeout, args.gap, args.rl_wait)
            results[(sl, tl)] = entry
        await send(ws, "session.end", {})

    # ---- Chấm điểm ----
    print("\n" + "=" * 72)
    print(f"ACCURACY  (mode={args.mode}, testset={args.testset.split('/')[-1]})")
    print("=" * 72)
    print(f"{'Chiều':<10}{'chrF++':>9}{'BLEU':>8}   {'baseline chrF++':>16}{'Δ glossary':>12}")
    all_h, all_r = [], []
    chrf_list = []
    for (sl, tl), e in results.items():
        chrf, bleu = score(e["hyps"], e["refs"])
        chrf_list.append(chrf)
        all_h += e["hyps"]; all_r += e["refs"]
        line = f"{sl+'->'+tl:<10}{chrf:>9.1f}{bleu:>8.1f}"
        if "base" in e:
            bchrf, _ = score(e["base"], e["refs"])
            line += f"   {bchrf:>16.1f}{chrf-bchrf:>+12.1f}"
        print(line)
    ov_chrf, ov_bleu = score(all_h, all_r)
    print("-" * 72)
    print(f"{'TỔNG':<10}{ov_chrf:>9.1f}{ov_bleu:>8.1f}")
    print("\n→ ĐIỀN VÀO SLIDE:")
    print(f"     • chrF++ tổng ~{ov_chrf:.0f} trên bộ {args.testset.split('/')[-1]} ({len(all_h)} câu)")
    if any("base" in e for e in results.values()):
        print("     • Δ so với glossary-off cho thấy glossary giữ thuật ngữ (xem cột Δ; EN→VI thường dương)")
    print("  (chrF++ ~50–60 = dịch tốt cho cặp VI-EN; nhớ ghi bộ test + mode khi trình bày)")


def main() -> None:
    p = argparse.ArgumentParser(description="Đo độ chính xác dịch (chrF++/BLEU) qua WebSocket.")
    p.add_argument("--testset", default="data/accuracy_business.json", help="File JSON [{src,ref,srcLang,tgtLang}].")
    p.add_argument("--mode", default="cloud", choices=["cloud", "offline", "mock"], help="Mode dịch (KHÔNG mock).")
    p.add_argument("--baseline", action="store_true", help="Dịch lại với glossary TẮT để so.")
    p.add_argument("--glossary", default="biz-default", help="glossaryId dùng (mặc định biz-default).")
    p.add_argument("--limit", type=int, default=0, help="Chỉ lấy N câu đầu (0 = tất cả).")
    p.add_argument("--gap", type=float, default=0.3, help="Nghỉ giữa các câu (tránh rate limit).")
    p.add_argument("--rl-wait", dest="rl_wait", type=float, default=25.0, help="Chờ khi Groq 429 (giây).")
    p.add_argument("--timeout", type=float, default=60.0, help="Timeout mỗi câu.")
    p.add_argument("--speaker", default="vn", help="Nhãn speaker.")
    p.add_argument("--ws", default="ws://localhost:8000/ws", help="URL WebSocket.")
    asyncio.run(run(p.parse_args()))


if __name__ == "__main__":
    main()
