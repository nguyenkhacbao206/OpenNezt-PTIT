"""Benchmark NMT (offline NLLB-200 CTranslate2) latency.

Translates ~20 English and ~20 Vietnamese sentences, times each call, and
writes a Markdown report. Run from backend/:  python tools/bench_nmt_latency.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from app.providers.ct2_nmt import translate_one

EN = [
    "Good morning, thank you all for joining today's meeting.",
    "Could you please share the quarterly sales report?",
    "We need to finalize the budget before the end of this week.",
    "The new product launch is scheduled for next month.",
    "Let's schedule a follow-up call to discuss the details.",
    "Our team has completed the first phase of the project.",
    "Please review the contract and send me your feedback.",
    "The customer requested a discount on the bulk order.",
    "I think we should hire two more engineers this quarter.",
    "The server was down for about thirty minutes yesterday.",
    "Can you confirm the delivery date for the shipment?",
    "We are expanding our operations into the Asian market.",
    "The marketing campaign increased our revenue by fifteen percent.",
    "Please make sure all invoices are paid on time.",
    "The board approved the merger during the last meeting.",
    "Our priority is to improve customer satisfaction this year.",
    "I will send you the meeting notes after the call.",
    "The prototype passed all the quality tests successfully.",
    "We should invest more in research and development.",
    "Thank you for your patience during the system upgrade.",
]

VI = [
    "Xin chào, cảm ơn mọi người đã tham gia cuộc họp hôm nay.",
    "Bạn có thể chia sẻ báo cáo doanh số quý này không?",
    "Chúng ta cần hoàn thiện ngân sách trước cuối tuần này.",
    "Buổi ra mắt sản phẩm mới được lên lịch vào tháng sau.",
    "Hãy sắp xếp một cuộc gọi tiếp theo để bàn chi tiết.",
    "Nhóm của chúng tôi đã hoàn thành giai đoạn đầu của dự án.",
    "Vui lòng xem lại hợp đồng và gửi phản hồi cho tôi.",
    "Khách hàng yêu cầu giảm giá cho đơn hàng số lượng lớn.",
    "Tôi nghĩ chúng ta nên tuyển thêm hai kỹ sư trong quý này.",
    "Máy chủ bị ngừng hoạt động khoảng ba mươi phút hôm qua.",
    "Bạn có thể xác nhận ngày giao hàng cho lô hàng không?",
    "Chúng tôi đang mở rộng hoạt động sang thị trường châu Á.",
    "Chiến dịch tiếp thị đã tăng doanh thu của chúng tôi mười lăm phần trăm.",
    "Vui lòng đảm bảo tất cả hóa đơn được thanh toán đúng hạn.",
    "Hội đồng đã phê duyệt việc sáp nhập trong cuộc họp trước.",
    "Ưu tiên của chúng tôi là cải thiện sự hài lòng của khách hàng năm nay.",
    "Tôi sẽ gửi cho bạn biên bản cuộc họp sau cuộc gọi.",
    "Bản mẫu đã vượt qua tất cả các bài kiểm tra chất lượng.",
    "Chúng ta nên đầu tư nhiều hơn vào nghiên cứu và phát triển.",
    "Cảm ơn sự kiên nhẫn của bạn trong quá trình nâng cấp hệ thống.",
]


def run(pairs, src, tgt):
    rows = []
    for text in pairs:
        t0 = time.perf_counter()
        out = translate_one(
            settings.offline_nmt_model_dir,
            settings.offline_nmt_intra_threads,
            text,
            src,
            tgt,
            settings.offline_nmt_beam_final,
            settings.offline_nmt_device,
            settings.offline_nmt_compute_type,
        )
        ms = (time.perf_counter() - t0) * 1000.0
        rows.append((text, out, ms))
        print(f"[{src}->{tgt}] {ms:7.1f} ms | {text[:45]}")
    return rows


def stats(rows):
    xs = sorted(r[2] for r in rows)
    n = len(xs)
    avg = sum(xs) / n
    p50 = xs[n // 2]
    p95 = xs[min(n - 1, int(round(0.95 * (n - 1))))]
    return avg, p50, p95, xs[0], xs[-1]


def main():
    print("Warming up model (load + first inference)...")
    t0 = time.perf_counter()
    translate_one(
        settings.offline_nmt_model_dir,
        settings.offline_nmt_intra_threads,
        "Hello world.",
        "en", "vi",
        settings.offline_nmt_beam_final,
        settings.offline_nmt_device,
        settings.offline_nmt_compute_type,
    )
    warm_ms = (time.perf_counter() - t0) * 1000.0
    print(f"Warmup (incl. model load): {warm_ms:.1f} ms\n")

    en_rows = run(EN, "en", "vi")
    vi_rows = run(VI, "vi", "en")

    en_s = stats(en_rows)
    vi_s = stats(vi_rows)
    all_rows = en_rows + vi_rows
    all_s = stats(all_rows)

    md = []
    md.append("# NMT Latency Benchmark Report\n")
    md.append(f"- **Model:** NLLB-200 distilled 600M (CTranslate2, `{settings.offline_nmt_model_dir}`)")
    md.append(f"- **Device / compute:** `{settings.offline_nmt_device}` / `{settings.offline_nmt_compute_type}`")
    md.append(f"- **Beam size:** {settings.offline_nmt_beam_final}")
    md.append(f"- **Intra threads:** {settings.offline_nmt_intra_threads}")
    md.append(f"- **Dataset:** {len(EN)} EN→VI + {len(VI)} VI→EN business-meeting sentences")
    md.append(f"- **Warmup (model load + 1st inference):** {warm_ms:.1f} ms  _(excluded from stats below)_\n")

    md.append("## Summary (per-sentence latency, warmed model)\n")
    md.append("| Direction | N | Avg (ms) | P50 (ms) | P95 (ms) | Min (ms) | Max (ms) |")
    md.append("|---|---|---|---|---|---|---|")
    md.append(f"| EN → VI | {len(en_rows)} | {en_s[0]:.1f} | {en_s[1]:.1f} | {en_s[2]:.1f} | {en_s[3]:.1f} | {en_s[4]:.1f} |")
    md.append(f"| VI → EN | {len(vi_rows)} | {vi_s[0]:.1f} | {vi_s[1]:.1f} | {vi_s[2]:.1f} | {vi_s[3]:.1f} | {vi_s[4]:.1f} |")
    md.append(f"| **Overall** | {len(all_rows)} | **{all_s[0]:.1f}** | {all_s[1]:.1f} | {all_s[2]:.1f} | {all_s[3]:.1f} | {all_s[4]:.1f} |\n")

    for title, rows in (("EN → VI", en_rows), ("VI → EN", vi_rows)):
        md.append(f"## Detail: {title}\n")
        md.append("| # | Latency (ms) | Source | Translation |")
        md.append("|---|---|---|---|")
        for i, (s, o, ms) in enumerate(rows, 1):
            s2 = s.replace("|", "\\|")
            o2 = o.replace("|", "\\|")
            md.append(f"| {i} | {ms:.1f} | {s2} | {o2} |")
        md.append("")

    out_path = Path(__file__).resolve().parent.parent / "docs" / "nmt_latency_report.md"
    out_path.parent.mkdir(exist_ok=True)
    out_path.write_text("\n".join(md), encoding="utf-8")
    print(f"\nReport written to: {out_path}")
    print(f"Overall avg latency: {all_s[0]:.1f} ms")


if __name__ == "__main__":
    main()
