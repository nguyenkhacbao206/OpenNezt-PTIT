# Báo cáo Đo độ trễ (Latency) — Hệ thống dịch VI ⇄ EN

> Tài liệu trình bày & bảo vệ. Số liệu đo thực tế bằng script tái lập được, không ước lượng.

---

## 1. Tóm tắt nhanh (đọc phần này trước)

| Chỉ số | Kết quả | Ghi chú |
|---|---|---|
| **NMT thuần** (chỉ dịch) | **~371 ms/câu** | Tầng dịch máy NLLB-200 |
| **End-to-End** (audio → chữ → giọng nói) | **~2.54 s/lượt** | Cả 3 tầng STT + NMT + TTS |
| Nút thắt cổ chai | **STT ~1.96 s (≈77%)** | Nhận dạng giọng nói là phần chậm nhất |
| Phần cứng | **CPU, int8** | Chưa dùng GPU |
| Dataset | **20 câu EN + 20 câu VI** | Chủ đề hội họp doanh nghiệp |

**Một câu chốt để trả lời:** *"Trên máy CPU, một lượt dịch hoàn chỉnh từ lúc nói xong đến khi ra bản dịch + giọng nói mất trung bình 2,5 giây; riêng phần dịch máy chỉ 0,37 giây — phần lớn thời gian là nhận dạng giọng nói (STT)."*

---

## 2. Hệ thống được đo

Pipeline dịch hội thoại thời gian thực, chạy **offline** (không cần internet):

```
Giọng nói  ──►  STT  ──►  NMT  ──►  TTS  ──►  Giọng nói (ngôn ngữ đích)
(audio)      (nhận dạng) (dịch máy) (tổng hợp)
```

| Tầng | Công nghệ | Cấu hình đo |
|---|---|---|
| **STT** — nhận dạng giọng nói | Faster-Whisper `small` | CPU, int8, VAD bật, beam 5 |
| **NMT** — dịch máy | NLLB-200 distilled 600M (CTranslate2) | CPU, int8, beam 4 |
| **TTS** — tổng hợp giọng nói | Piper (mỗi ngôn ngữ 1 voice) | CPU, length_scale 1.0 |

---

## 3. Phương pháp đo

- **Dataset:** 20 câu Tiếng Anh + 20 câu Tiếng Việt, nội dung hội họp doanh nghiệp (báo cáo doanh số, hợp đồng, ngân sách…), độ dài câu thực tế.
- **Cách đo:** dùng `time.perf_counter()` (đồng hồ độ phân giải cao) bao quanh từng tầng.
- **Warm-up:** lần chạy đầu tiên (nạp model vào RAM) được **đo riêng và loại khỏi thống kê**, vì nó chỉ xảy ra 1 lần lúc khởi động — không phản ánh độ trễ vận hành.
- **Đầu vào E2E là giọng nói thật:** mỗi câu được tổng hợp thành audio bằng Piper rồi **resample về WAV 16 kHz mono** — đúng định dạng client gửi lên qua sự kiện `audio.chunk`. Nghĩa là STT xử lý audio thật, không phải chữ có sẵn.
- **Chỉ số thống kê:** trung bình (avg), trung vị (P50), phân vị 95 (P95), min, max.

**Script tái lập** (chạy từ thư mục `backend/`):
```bash
python tools/bench_nmt_latency.py    # đo NMT thuần  -> docs/nmt_latency_report.md
python tools/bench_e2e_latency.py    # đo end-to-end -> docs/e2e_latency_report.md
```

---

## 4. Kết quả

### 4.1. NMT thuần (chỉ tầng dịch máy)

| Chiều dịch | N | Avg (ms) | P50 | P95 | Min | Max |
|---|---|---|---|---|---|---|
| EN → VI | 20 | 427.6 | 419.7 | 505.1 | 362.6 | 604.3 |
| VI → EN | 20 | 313.7 | 316.0 | 353.3 | 260.5 | 355.2 |
| **Tổng** | 40 | **370.7** | 362.6 | 501.4 | 260.5 | 604.3 |

> EN→VI chậm hơn VI→EN (~114 ms) vì câu Tiếng Việt sinh ra nhiều token hơn.

### 4.2. End-to-End (STT + NMT + TTS)

| Chiều | N | STT | NMT | TTS | **E2E avg** | P50 | P95 | Max |
|---|---|---|---|---|---|---|---|---|
| EN → VI | 20 | 1905 | 453 | 161 | **2519** | 2507 | 2710 | 2749 |
| VI → EN | 20 | 2013 | 386 | 156 | **2556** | 2566 | 2683 | 2699 |
| **Tổng** | 40 | 1959 | 420 | 159 | **2537** | 2522 | 2708 | 2749 |

*(đơn vị: mili-giây)*

**Phân bổ thời gian trong 1 lượt E2E (~2.54 s):**

| Tầng | Thời gian | Tỷ lệ |
|---|---|---|
| STT (nhận dạng) | ~1.96 s | **≈ 77%** |
| NMT (dịch)      | ~0.42 s | ≈ 17% |
| TTS (giọng nói) | ~0.16 s | ≈ 6% |

---

## 5. Nhận xét & Kết luận

1. **Phần dịch máy rất nhanh (~0.37 s)** — không phải điểm nghẽn.
2. **STT chiếm ~77% tổng độ trễ.** Muốn tăng tốc thì tối ưu STT là hiệu quả nhất.
3. **Kết quả ổn định:** khoảng cách P95 và trung bình hẹp (chênh ~7%), không có câu nào bị chậm bất thường.
4. Toàn bộ chạy trên **CPU** — đây là kịch bản "xấu nhất" về tốc độ.

**Hướng giảm độ trễ (nếu bị hỏi "làm sao nhanh hơn?"):**
- Chuyển STT sang **GPU** (`STT_DEVICE=cuda`, `float16`) → giảm mạnh nhất vì STT là nút thắt.
- Dùng model STT nhỏ hơn (`base`/`tiny`) nếu chấp nhận đánh đổi độ chính xác.
- Streaming theo cụm VAD (đã có sẵn): bản dịch xuất hiện dần **khi đang nói**, nên độ trễ *cảm nhận* của người dùng thấp hơn con số end-to-end ở trên.

---

## 6. Chuẩn bị Hỏi–Đáp (Q&A)

**H: Độ trễ trung bình của model là bao nhiêu?**
Đ: Riêng model dịch (NMT): ~371 ms/câu. Cả pipeline end-to-end: ~2.54 s/lượt.

**H: Vì sao end-to-end lại 2.5 giây, có chậm không?**
Đ: 77% là do nhận dạng giọng nói (STT) chạy trên CPU. Bản thân dịch máy chỉ 0.37 s. Trên GPU con số end-to-end sẽ giảm rất nhiều.

**H: Đo trên bao nhiêu mẫu? Có warm-up không?**
Đ: 40 câu (20 Anh + 20 Việt), chủ đề hội họp. Warm-up (nạp model lần đầu) được đo riêng và loại khỏi thống kê để số liệu phản ánh đúng lúc vận hành.

**H: Đầu vào là chữ hay giọng nói thật?**
Đ: Giọng nói thật — mỗi câu được tổng hợp audio rồi resample về 16 kHz, đúng như client gửi lên. STT xử lý audio thật chứ không "ăn gian" bằng chữ có sẵn.

**H: Chiều dịch nào chậm hơn?**
Đ: Chênh lệch không đáng kể ở E2E (~37 ms). Riêng NMT thì EN→VI chậm hơn ~114 ms do sinh nhiều token hơn.

**H: Số liệu có tin cậy / tái lập được không?**
Đ: Có. Đo bằng `time.perf_counter()`, có script `tools/bench_nmt_latency.py` và `tools/bench_e2e_latency.py`, chạy lại cho kết quả tương đương. Báo cáo chi tiết từng câu ở `docs/nmt_latency_report.md` và `docs/e2e_latency_report.md`.

**H: Làm sao để nhanh hơn?**
Đ: Ưu tiên đưa STT lên GPU (float16); phụ là dùng model STT nhỏ hơn hoặc tận dụng streaming theo cụm để giảm độ trễ cảm nhận.

---

## 7. Phụ lục — File liên quan

| File | Nội dung |
|---|---|
| `docs/nmt_latency_report.md` | Bảng chi tiết 40 câu: độ trễ + bản dịch (NMT thuần) |
| `docs/e2e_latency_report.md` | Bảng chi tiết 40 câu: timing từng tầng + transcript STT + bản dịch |
| `tools/bench_nmt_latency.py` | Script đo NMT thuần |
| `tools/bench_e2e_latency.py` | Script đo end-to-end |
