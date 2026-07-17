# Hướng dẫn test — Phiên dịch Việt ⇄ Anh (streaming)

Test theo 4 tầng, từ nhanh → đầy đủ. Chạy tầng nào cũng được; càng xuống dưới càng gần trải nghiệm thật.

Chuẩn bị (một lần): `cd backend` → `.venv\Scripts\Activate.ps1`.

---

## Tầng 1 — Key & provider (không cần server, ~5s)

```powershell
python tools/check_groq_key.py
```
✅ Kỳ vọng: `✅ KEY DÙNG ĐƯỢC. Dịch thử 'Xin chào...' -> 'Hello, nice to meet you.'`

Nếu ❌ 401 → key sai; ❌ 429 → chạm rate limit, đợi chút.

---

## Tầng 2 — Dịch 2 chiều (không cần server)

```powershell
python -c "import asyncio; from app.core.config import settings; from app.providers import groq_client as g; k,u,m=settings.groq_api_key,settings.groq_api_url,settings.groq_nmt_model; print(asyncio.run(g.translate_text(k,u,m,'Chốt hợp đồng trước cuối quý.','vi','en'))); print(asyncio.run(g.translate_text(k,u,m,'Schedule a follow-up next Tuesday.','en','vi')))"
```
✅ Kỳ vọng: một câu tiếng Anh và một câu tiếng Việt hợp lý.

---

## Tầng 3 — End-to-end WebSocket + STREAMING (cần server)

**Cửa sổ 1 — server:**
```powershell
uvicorn app.main:app --reload
```

**Cửa sổ 2 — test streaming.** Cần một file WAV có tiếng nói (16kHz càng tốt; script tự resample thô nếu khác):
```powershell
# Dùng file WAV có sẵn (đối tác Singapore nói tiếng Anh -> dịch sang Việt):
python tools/test_stream_client.py --wav duong_dan\file.wav --src en --tgt vi --speaker sg --windows 3

# Không có file -> thu 5s từ mic (nói tiếng Việt -> dịch sang Anh):
python tools/test_stream_client.py --src vi --tgt en --speaker vn
```

✅ Kỳ vọng: với mỗi cửa sổ lớn dần in ra `⏳ DỰ ĐOÁN : ...`, và cuối cùng `✅ CHỐT : ...`.
Đây chính là hành vi **dự đoán → tinh chỉnh → chốt**.

> Tạo nhanh một WAV tiếng Anh để test trên Windows (PowerShell):
> ```powershell
> Add-Type -AssemblyName System.Speech
> $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
> $s.SetOutputToWaveFile("$PWD\test_en.wav")
> $s.Speak("Hello team, let us finalize the contract this quarter.")
> $s.Dispose()
> ```
> Rồi: `python tools/test_stream_client.py --wav test_en.wav --src en --tgt vi --speaker sg`

**Test push-to-talk 1 lượt (không streaming):**
```powershell
python tools/talk_translate.py --mode cloud --src vi --tgt en
```

**Test chế độ mock (không cần key, kiểm tra khung WS):**
```powershell
python tools/talk_translate.py --mode mock
```

---

## Tầng 4 — Full-stack trên trình duyệt (trải nghiệm thật)

**Cửa sổ 1:** `uvicorn app.main:app --reload` (trong `backend/`)
**Cửa sổ 2:** `npm run dev` (trong `frontend/`)

1. Mở http://localhost:3000/translator → chấm xanh "Đã kết nối".
2. Bấm **● Nhấn để nói** ở một phía, cho phép quyền micro, nói một câu.
3. **Khi đang nói:** khung **"⏳ Dự đoán"** viền vàng hiện bản dịch tạm, cập nhật ~1.2s/lần.
4. Bấm **■ Dừng & Chốt:** bản dịch chính thức thay thế bản dự đoán, vào hội thoại.
5. Kiểm tra **Latency HUD** (STT/NMT/E2E ms) cập nhật; thử nút **Chế độ** Cloud ⇄ Mock.

### Checklist nghiệm thu
- [ ] Nói tiếng Việt (nửa dưới) → ra bản dịch tiếng Anh; nói tiếng Anh (nửa trên) → ra tiếng Việt.
- [ ] Bản "Dự đoán" xuất hiện & thay đổi trong lúc nói.
- [ ] Bản "Chốt" đúng/đủ nghĩa hơn bản dự đoán khi dứt câu.
- [ ] Ngắt kết nối / F5 không làm treo; đóng tab → server log "session wiped" (zero-retention).

---

## Sự cố thường gặp

| Triệu chứng | Xử lý |
|---|---|
| `⚠ timeout chờ server` | Server chưa chạy ở `localhost:8000`. |
| `error [stt_failed] ... 401` | Key Groq sai (Tầng 1 để soi). |
| `429` giữa lúc streaming | Chạm rate limit free tier — giảm `--windows`, hoặc giãn nhịp (nói câu ngắn hơn). |
| Bản dịch trông giả/lặp | Key trống → fallback mock. Điền `GROQ_API_KEY`, `CLOUD_PROVIDER=groq`, khởi động lại server. |
| Trình duyệt không xin quyền mic | Phải chạy qua `http://localhost` (không mở file HTML trực tiếp). |
