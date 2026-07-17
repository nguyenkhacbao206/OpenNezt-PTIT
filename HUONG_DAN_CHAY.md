# Hướng dẫn chạy — Phiên dịch Việt ⇄ Anh real-time (Cloud/Groq)

Chế độ dịch **hai chiều** (vi→en và en→vi) qua micro trên giao diện, streaming
qua WebSocket về backend, dùng **Groq free tier** (Whisper STT + Llama NMT).

## 0. Chuẩn bị key Groq (một lần)

1. Lấy key miễn phí tại https://console.groq.com/keys (dạng `gsk_...`).
2. Điền vào `backend/.env`:
   ```env
   DEFAULT_MODE=cloud
   CLOUD_PROVIDER=groq
   GROQ_API_KEY=gsk_...cua_ban
   ```
3. Kiểm tra key trước khi chạy:
   ```powershell
   cd backend; .venv\Scripts\Activate.ps1
   python tools/check_groq_key.py
   ```
   Thấy `✅ KEY DÙNG ĐƯỢC` là ổn.

## 1. Chạy Backend (cửa sổ 1)

```powershell
cd E:\Work\VAIC\backend
python -m venv .venv                 # lần đầu
.venv\Scripts\Activate.ps1
pip install -r requirements.txt      # lần đầu
uvicorn app.main:app --reload        # WS tại ws://localhost:8000/ws
```

## 2. Chạy Frontend (cửa sổ 2)

```powershell
cd E:\Work\VAIC\frontend
npm install                          # lần đầu
npm run dev                          # http://localhost:3000
```
Kiểm tra `frontend/.env` có: `VITE_WS_URL=ws://localhost:8000/ws`.

## 3. Dùng

1. Mở http://localhost:3000 → bấm **🎙 Phiên dịch trực tiếp** (hoặc vào `/translator`).
2. Trang tự kết nối WebSocket (chấm xanh = "Đã kết nối").
3. **Split-screen + dịch streaming (dự đoán → chốt):**
   - Nửa trên 🇸🇬 (English) / nửa dưới 🇻🇳 (Tiếng Việt). Bấm **● Nhấn để nói** và nói.
   - **Khi đang nói**, cứ ~1.2s một khung **"⏳ Dự đoán"** (viền vàng nhấp nháy) hiện bản dịch tạm và tự tinh chỉnh khi có thêm ngữ cảnh.
   - Bấm **■ Dừng & Chốt** → bản dịch **chính thức** thay thế bản dự đoán và vào hội thoại.
4. **Latency HUD** trên đầu hiện STT / NMT / E2E ms. Nút **Chế độ** đổi Cloud ⇄ Mock để fallback khi demo.

> Lưu ý chi phí: mỗi ~1.2s khi nói gọi Groq (STT+NMT) một lần cho bản dự đoán, cộng 1 lần chốt. Câu dài sẽ tốn nhiều request hơn — để ý rate limit free tier.

> Lần đầu bấm nói, trình duyệt xin quyền micro — chọn **Allow**.

## Kiến trúc (tóm tắt)

```
[Mic trình duyệt] → WAV 16kHz base64 → WebSocket → Backend
   handler → CloudSTTProvider (Groq Whisper) → CloudNMTProvider (Groq Llama, 2 chiều)
   → stt.final / nmt.result / metrics → hiển thị real-time trên UI
```

- Backend chọn vendor qua `CLOUD_PROVIDER` (`groq` mặc định | `gemini`). Thiếu key → tự fallback mock.
- Zero-retention: audio/text chỉ trong RAM, xoá khi đóng phiên.

## Công cụ kiểm thử nhanh (không cần frontend)

```powershell
cd backend; .venv\Scripts\Activate.ps1
python tools/check_groq_key.py          # kiểm tra key Groq
python tools/talk_translate.py --mode cloud --src vi --tgt en   # mic CLI qua server
```

## Sự cố thường gặp

| Triệu chứng | Cách xử lý |
|---|---|
| UI báo "Lỗi kết nối WebSocket" | Backend chưa chạy, hoặc sai `VITE_WS_URL`. |
| Bản dịch trông giả/lặp | Key trống → fallback mock. Điền `GROQ_API_KEY`, đặt `CLOUD_PROVIDER=groq`, khởi động lại server. |
| `error [stt_failed] ... 401` | Key Groq sai. Lấy lại tại console.groq.com/keys. |
| Không thu được tiếng | Chưa cấp quyền micro cho trình duyệt, hoặc sai thiết bị mặc định. |
