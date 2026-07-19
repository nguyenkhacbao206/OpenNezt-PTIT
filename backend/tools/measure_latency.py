"""Đo latency THẬT của pipeline dịch (STT → NMT → TTS) qua WebSocket.

Sinh ra đúng những con số trên slide "Latency & Responsiveness":
  • first partial  — từ lúc gửi cửa sổ audio đầu tiên tới khi CHỮ hiện ra
                     (event `stt.partial`/`nmt.partial`)  → slide "~0.3s"
  • end-to-end     — từ lúc CHỐT câu (`audio.chunk`) tới khi đối phương NGHE được
                     (event `tts.audio`)                  → slide "~1.5s"
  • server metrics — `sttMs · nmtMs · e2eMs` đọc thẳng từ event `metrics`
                     → slide "100% of turns latency-measured"

Đo phía CLIENT (gồm cả mạng) = đúng cái BGK cảm nhận, không chỉ thời gian xử lý
trong server.

CẦN server đang chạy ở đúng MODE sẽ demo:
    uvicorn app.main:app --reload          # rồi set DEFAULT_MODE, hoặc truyền --mode

QUAN TRỌNG
  • KHÔNG đo ở mode=mock — nó trả chữ giả ~vài chục ms, số vô nghĩa.
  • Dùng WAV lời nói THẬT (câu ngắn 2–4s). File im lặng bị silence-guard bỏ qua →
    không có kết quả để đo.
  • Lượt đầu nạp model/kết nối (chậm) nên script BỎ `--warmup` lượt đầu.

Cách dùng (từ backend/, đã bật venv):
    python tools/measure_latency.py --wav mau_vi.wav --mode cloud --src vi --tgt en
    python tools/measure_latency.py --wav mau_en.wav --mode offline --src en --tgt vi --runs 12
    python tools/measure_latency.py --record --mode cloud            # thu 4s từ mic mỗi lượt
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import io
import json
import sys
import time

import numpy as np
import soundfile as sf
import websockets

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SAMPLE_RATE = 16000
PARTIAL_TYPES = {"stt.partial", "nmt.partial"}


# --------------------------------------------------------------------------- #
# Audio helpers (giống tools/test_stream_client.py để đồng nhất định dạng)
# --------------------------------------------------------------------------- #
def load_wav(path: str) -> np.ndarray:
    """Đọc WAV -> float32 mono 16 kHz (resample thô cho mục đích test)."""
    data, sr = sf.read(path, dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)
    if sr != SAMPLE_RATE:
        idx = np.round(np.arange(0, len(data), sr / SAMPLE_RATE)).astype(int)
        idx = idx[idx < len(data)]
        data = data[idx]
    return data.astype("float32")


def record_mic(seconds: float) -> np.ndarray:
    """Thu `seconds` giây từ mic -> float32 mono 16 kHz."""
    import sounddevice as sd

    print(f"● Thu {seconds:.0f}s từ mic... nói NGAY (một câu công việc ngắn).")
    frames = sd.rec(int(seconds * SAMPLE_RATE), samplerate=SAMPLE_RATE, channels=1, dtype="float32")
    sd.wait()
    print("■ Xong thu.")
    return frames.reshape(-1)


def to_wav_b64(audio: np.ndarray) -> str:
    """float32 mono -> WAV PCM16 -> base64 (đúng thứ audio.chunk mong đợi)."""
    buf = io.BytesIO()
    sf.write(buf, audio, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    return base64.b64encode(buf.getvalue()).decode("ascii")


# --------------------------------------------------------------------------- #
# WebSocket helpers
# --------------------------------------------------------------------------- #
async def send(ws, event: str, data: dict) -> None:
    await ws.send(json.dumps({"type": event, "data": data}))


async def recv_next(ws, timeout: float):
    """Trả về (type, data, t_perf) cho event kế tiếp, hoặc None nếu timeout."""
    try:
        raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
    except asyncio.TimeoutError:
        return None
    msg = json.loads(raw)
    return msg.get("type"), msg.get("data", {}), time.perf_counter()


async def drain_pending(ws) -> None:
    """Vét sạch event còn tồn (partial của cửa sổ trước) trước khi vào pha CHỐT,
    để đo see/hear/metrics không bị lẫn sự kiện."""
    while (await recv_next(ws, 0.15)) is not None:
        pass


def _is_rate_limit(data: dict) -> bool:
    msg = str(data.get("message") or "").lower()
    return "429" in msg or "rate limit" in msg or "rate_limit" in msg


async def measure_turn(
    ws, audio: np.ndarray, windows: int, speaker: str, want_tts: bool, timeout: float
) -> dict:
    """Đo một lượt nói. status: ok | empty | rate_limited."""
    total = len(audio)

    # ---- Streaming partials: gửi cửa sổ lớn dần, canh thời điểm CHỮ đầu tiên ----
    first_partial: float | None = None
    for i in range(1, windows + 1):
        end = max(1, int(total * i / (windows + 1)))
        t_send = time.perf_counter()
        await send(ws, "audio.partial", {"speaker": speaker, "audio": to_wav_b64(audio[:end])})
        while True:
            ev = await recv_next(ws, timeout)
            if ev is None:
                break
            etype, data, t = ev
            if etype in PARTIAL_TYPES:
                if first_partial is None:
                    first_partial = t - t_send  # RTT cửa sổ đầu = "chữ bắt đầu hiện"
                break
            if etype == "error":
                if _is_rate_limit(data):
                    return {"status": "rate_limited"}
                break

    # Vét partial còn sót -> pha CHỐT đo sạch (fix hụt tts.audio do lẫn sự kiện).
    await drain_pending(ws)

    # ---- Chốt câu: audio.chunk -> đo tới lúc THẤY (nmt.result) và NGHE (tts.audio) ----
    t_chunk = time.perf_counter()
    await send(ws, "audio.chunk", {"speaker": speaker, "audio": to_wav_b64(audio)})

    see_lat = hear_lat = metrics = None
    dst_text = ""
    tts_error = False
    deadline = time.perf_counter() + timeout
    while time.perf_counter() < deadline:
        ev = await recv_next(ws, max(0.1, deadline - time.perf_counter()))
        if ev is None:
            break
        etype, data, t = ev
        if etype == "nmt.result":
            see_lat = t - t_chunk
            dst_text = data.get("dstText", "")
        elif etype == "tts.audio":
            hear_lat = t - t_chunk
        elif etype == "metrics":
            metrics = data
            break  # metrics là event cuối của lượt
        elif etype == "error":
            if data.get("code") == "tts_failed":
                tts_error = True  # TTS lỗi KHÔNG hủy lượt -> vẫn có metrics phía sau
            elif _is_rate_limit(data):
                return {"status": "rate_limited"}
            else:
                print(f"   ❌ error [{data.get('code')}]: {str(data.get('message'))[:90]}")
                return {"status": "empty"}

    if metrics is None and see_lat is None:
        return {"status": "empty"}  # im lặng / guard / lỗi

    return {
        "status": "ok",
        "first_partial": first_partial,
        "see": see_lat,
        "hear": hear_lat,
        "sttMs": (metrics or {}).get("sttMs"),
        "nmtMs": (metrics or {}).get("nmtMs"),
        "e2eMs": (metrics or {}).get("e2eMs"),
        "dst": dst_text,
        "tts_error": tts_error or (want_tts and hear_lat is None),
    }


# --------------------------------------------------------------------------- #
# Thống kê + in
# --------------------------------------------------------------------------- #
def stat(vals: list[float]) -> tuple[float, float, float] | None:
    xs = [v for v in vals if v is not None]
    if not xs:
        return None
    a = np.array(xs, dtype=float)
    return float(np.percentile(a, 50)), float(np.percentile(a, 90)), float(a.mean())


def row(label: str, vals: list, unit: str) -> str:
    s = stat(vals)
    if s is None:
        return f"  {label:<26} —      (không có số)"
    p50, p90, mean = s
    if unit == "s":  # ms -> s cho các số client
        p50, p90, mean = p50 / 1000, p90 / 1000, mean / 1000
        return f"  {label:<26} p50 {p50:5.2f}s   p90 {p90:5.2f}s   mean {mean:5.2f}s   (n={len([v for v in vals if v is not None])})"
    return f"  {label:<26} p50 {p50:6.0f}   p90 {p90:6.0f}   mean {mean:6.0f} ms  (n={len([v for v in vals if v is not None])})"


async def run(args) -> None:
    # Tải/thu audio một lần nếu dùng --wav; nếu --record thì thu mỗi lượt.
    fixed_audio = None if args.record else load_wav(args.wav)
    if fixed_audio is not None and len(fixed_audio) / SAMPLE_RATE < 0.4:
        print("⚠ WAV quá ngắn (<0.4s). Dùng câu nói thật 2–4s.")
        return

    if args.mode == "mock":
        print("⛔ mode=mock cho số GIẢ (~vài chục ms). Dùng --mode cloud hoặc offline.\n")

    print(f"Kết nối {args.ws}  |  mode={args.mode}  {args.src}->{args.tgt}  "
          f"tts={'on' if args.tts else 'off'}  warmup={args.warmup}  runs={args.runs}\n")

    results: list[dict] = []
    async with websockets.connect(args.ws, max_size=None) as ws:
        await send(ws, "session.start",
                   {"mode": args.mode, "sourceLang": args.src, "targetLang": args.tgt})
        await recv_next(ws, 5)  # session.started
        if args.tts:
            await send(ws, "config.update", {"ttsOn": True})
            await recv_next(ws, 5)  # config.updated

        total = args.warmup + args.runs
        idx = 0          # số lượt đã HOÀN TẤT (kể cả warmup)
        printed_dst = False
        while idx < total:
            audio = record_mic(args.seconds) if args.record else fixed_audio
            is_warm = idx < args.warmup
            tag = "warmup" if is_warm else f"lượt {idx - args.warmup + 1}/{args.runs}"
            r = await measure_turn(ws, audio, args.windows, args.speaker, args.tts, args.timeout)

            if r["status"] == "rate_limited":
                print(f"  [{tag}] ⏳ Groq 429 (free tier 20 req/phút) — chờ {args.rl_wait:.0f}s rồi thử lại...")
                await asyncio.sleep(args.rl_wait)
                continue  # thử lại CHÍNH lượt này, không tăng idx
            if r["status"] == "empty":
                print(f"  [{tag}] ⚠ không có kết quả — WAV là lời nói thật? server đúng mode?")
            else:
                fp = f"{r['first_partial']*1000:.0f}ms" if r["first_partial"] is not None else "—"
                hr = f"{r['hear']*1000:.0f}ms" if r["hear"] is not None else "—"
                see_s = f"{r['see']*1000:.0f}ms" if r["see"] is not None else "—"
                e2e_s = f"{r['e2eMs']:.0f}ms" if r["e2eMs"] is not None else "—"
                print(f"  [{tag}] first-partial {fp:>7}  |  see {see_s:>7}  |  hear {hr:>7}  |  "
                      f"server e2e {e2e_s}" + ("  (TTS off/lỗi)" if r["tts_error"] else ""))
                if not is_warm and r["dst"] and not printed_dst:
                    print(f"        └ dịch: {r['dst'][:70]}")
                    printed_dst = True
                if not is_warm:
                    results.append(r)
            idx += 1
            await asyncio.sleep(args.gap)

        await send(ws, "session.end", {})

    # ---- Tổng hợp ----
    if not results:
        print("\nKhông đo được lượt nào. Kiểm tra: server chạy? đúng mode? WAV là lời nói thật?")
        return

    print("\n" + "=" * 68)
    print(f"KẾT QUẢ  (mode={args.mode}, n={len(results)} lượt, đã bỏ {args.warmup} warm-up)")
    print("=" * 68)
    print("CLIENT (gồm mạng — cái BGK cảm nhận):")
    print(row("first partial (chữ hiện)", [r["first_partial"] and r["first_partial"] * 1000 for r in results], "s"))
    print(row("e2e: bạn dừng → THẤY", [r["see"] and r["see"] * 1000 for r in results], "s"))
    print(row("e2e: bạn dừng → NGHE", [r["hear"] and r["hear"] * 1000 for r in results], "s"))
    print("SERVER (event metrics — xử lý thuần):")
    print(row("sttMs", [r["sttMs"] for r in results], "ms"))
    print(row("nmtMs", [r["nmtMs"] for r in results], "ms"))
    print(row("e2eMs", [r["e2eMs"] for r in results], "ms"))

    # ---- Gợi ý số điền vào slide ----
    fp = stat([r["first_partial"] * 1000 for r in results if r["first_partial"] is not None])
    hear = stat([r["hear"] * 1000 for r in results if r["hear"] is not None])
    see = stat([r["see"] * 1000 for r in results if r["see"] is not None])
    e2e_slide = hear or see  # nếu không bật TTS thì dùng "thấy"
    print("\n→ ĐIỀN VÀO SLIDE (dùng p50):")
    if fp:
        print(f"     • first partial : ~{fp[0]/1000:.1f}s")
    if e2e_slide:
        kind = "nghe được" if hear else "thấy bản dịch"
        print(f"     • end-to-end    : ~{e2e_slide[0]/1000:.1f}s  ({kind})")
    print(f"     • 100% lượt đều có metric (sttMs/nmtMs/e2eMs) — {len(results)}/{len(results)}")
    print("  (nhớ ghi rõ máy đo: CPU/GPU, mode, cloud/offline — để số trung thực trước BGK)")


def main() -> None:
    p = argparse.ArgumentParser(description="Đo latency thật của pipeline dịch qua WebSocket.")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--wav", help="File WAV lời nói thật (2–4s).")
    src.add_argument("--record", action="store_true", help="Thu từ mic mỗi lượt (--seconds).")
    p.add_argument("--mode", default="cloud", choices=["cloud", "offline", "mock"],
                   help="Mode của phiên (đo demo: cloud hoặc offline; KHÔNG mock).")
    p.add_argument("--src", default="vi", help="Ngôn ngữ nguồn (mặc định vi).")
    p.add_argument("--tgt", default="en", help="Ngôn ngữ đích (mặc định en).")
    p.add_argument("--runs", type=int, default=10, help="Số lượt đo (mặc định 10).")
    p.add_argument("--warmup", type=int, default=2, help="Số lượt warm-up bỏ đi (mặc định 2).")
    p.add_argument("--windows", type=int, default=1,
                   help="Số cửa sổ partial mỗi lượt (mặc định 1; càng nhiều càng tốn request Groq).")
    p.add_argument("--rl-wait", dest="rl_wait", type=float, default=25.0,
                   help="Giây chờ khi gặp Groq 429 rồi thử lại lượt đó (mặc định 25).")
    p.add_argument("--tts", dest="tts", action="store_true", default=True,
                   help="Bật TTS để đo tới lúc NGHE được (mặc định bật).")
    p.add_argument("--no-tts", dest="tts", action="store_false", help="Tắt TTS (chỉ đo tới THẤY).")
    p.add_argument("--seconds", type=float, default=4.0, help="Độ dài thu mic khi --record.")
    p.add_argument("--gap", type=float, default=0.4, help="Nghỉ giữa các lượt (tránh rate limit).")
    p.add_argument("--timeout", type=float, default=45.0, help="Timeout chờ server mỗi bước.")
    p.add_argument("--speaker", default="vn", help="Nhãn speaker (vn|sg).")
    p.add_argument("--ws", default="ws://localhost:8000/ws", help="URL WebSocket.")
    args = p.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
