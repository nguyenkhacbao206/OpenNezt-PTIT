# OpenNezt-PTIT — Trình dịch hội thoại thời gian thực (Việt ⇄ Anh)

Ứng dụng dịch song ngữ **Tiếng Việt ⇄ Tiếng Anh** cho các cuộc họp, thời gian thực.
Gồm hai phần độc lập giao tiếp qua **một WebSocket duy nhất** (`ws://<host>:8000/ws`):

| Thư mục | Công nghệ | Vai trò |
|---------|-----------|---------|
| `backend/` | FastAPI + WebSocket (Python) | Pipeline **STT → NMT → TTS** (nhận diện giọng nói → dịch → tổng hợp giọng nói) |
| `frontend/` | Expo / React Native | App di động — luồng **RTT** (Real-Time Translation) là giao diện dịch trực tiếp |

**Sản phẩm chính = ghép cặp 1:1 trong mạng LAN ("chat nội bộ").** Hai thiết bị cùng
trỏ tới một backend trong mạng LAN, tìm thấy nhau ở sảnh chờ (lobby), ghép cặp vào
một phòng 1:1 và dịch cho nhau: khi A nói (tiếng A), B nhận được bản dịch (tiếng B)
**kèm âm thanh TTS**, và ngược lại.

---

## 1. Yêu cầu môi trường

- **Python 3.10+** (cho backend)
- **Node.js 18+** và npm (cho frontend)
- **Expo Go** trên điện thoại (Android/iOS) nếu muốn chạy trên máy thật
- (Tùy chọn) Tài khoản **Groq** miễn phí để dùng chế độ cloud — lấy key tại
  https://console.groq.com/keys (key bắt đầu bằng `gsk_...`)

---

## 2. Chạy Backend

Từ thư mục `backend/`:

### Windows (PowerShell)
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### macOS / Linux
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Cấu hình `.env`
Sao chép file mẫu rồi điền cấu hình:
```bash
cp .env.example .env      # Windows: copy .env.example .env
```
Các thiết lập quan trọng trong `.env`:

| Biến | Ý nghĩa | Gợi ý |
|------|---------|-------|
| `DEFAULT_MODE` | Chế độ pipeline: `mock` \| `cloud` \| `offline` | `mock` để chạy thử ngay (không cần model/key); `cloud` cần Groq key |
| `GROQ_API_KEY` | Key Groq (cho chế độ cloud) | Bắt buộc nếu `DEFAULT_MODE=cloud` |
| `TTS_ENGINE` | Giọng đọc: `edge` (mặc định, miễn phí, online) \| `piper` \| `mock` | `edge` cho ra giọng tiếng Việt thật, không cần key |
| `HOST` / `PORT` | Địa chỉ lắng nghe | `0.0.0.0` / `8000` để các máy khác trong LAN kết nối được |

> **Không có key Groq?** Cứ để `DEFAULT_MODE=mock` — pipeline vẫn chạy đầy đủ với dữ
> liệu giả để kiểm thử luồng. Chế độ `cloud` tự động lùi về mock khi thiếu key.

### Khởi động server
```bash
# Chạy phát triển (chỉ máy này truy cập được)
uvicorn app.main:app --reload

# Chạy để các thiết bị khác trong mạng LAN kết nối (dùng cho ghép cặp)
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Sau khi chạy:
- Health check (JSON): http://localhost:8000/
- Console test trong trình duyệt: http://localhost:8000/app
- WebSocket: `ws://localhost:8000/ws`

### Kiểm tra nhanh
```bash
python tools/check_groq_key.py     # kiểm tra Groq key có hoạt động không
```

---

## 3. Chạy Frontend (Expo / React Native)

Từ thư mục `frontend/`:
```bash
cd frontend
npm install
npm start          # mở Expo (nhấn a=Android, i=iOS, w=web)
```
Hoặc chạy thẳng nền tảng:
```bash
npm run android
npm run ios
npm run web
```

Kiểm tra chất lượng code trước khi commit:
```bash
npm run typecheck  # tsc --noEmit
npm run lint       # eslint src/**/*.{ts,tsx}
```

---

## 4. Kết nối hai máy thật trong mạng LAN (ghép cặp 1:1)

1. Chạy backend với `--host 0.0.0.0`:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
2. Tìm địa chỉ IPv4 của máy chạy backend:
   - Windows: `ipconfig` → tìm dòng `IPv4 Address` (ví dụ `192.168.1.10`)
   - macOS/Linux: `ifconfig` hoặc `ip addr`
3. **Mở tường lửa** cho cổng TCP 8000 trên máy backend.
4. Trên **cả hai** thiết bị, mở app và vào **Demo1 → "Cài đặt backend"**, đặt WS URL:
   ```
   ws://<lan-ip>:8000/ws
   ```
   (thay `<lan-ip>` bằng IP ở bước 2, ví dụ `ws://192.168.1.10:8000/ws`)
5. Cả hai vào sảnh chờ → thấy nhau → mời & chấp nhận → ghép cặp → nói và nghe bản dịch.

> **Lưu ý về micro trên web:** trình duyệt chỉ cho phép thu âm trên `localhost`/https.
> Vì vậy trên máy thật hãy dùng **Expo Go** (điện thoại), hoặc chạy **Expo Web** trên
> localhost của chính từng máy (chỉ WS URL cần trỏ tới IP LAN).

---

## 5. Ba chế độ pipeline

Cấu hình bằng `DEFAULT_MODE` trong `.env` (hoặc đổi giữa phiên qua `config.update`):

| Chế độ | STT | NMT | Yêu cầu |
|--------|-----|-----|---------|
| **mock** | giả | giả | Không cần gì — chạy ngay |
| **cloud** | Groq Whisper | Groq Llama | `GROQ_API_KEY` |
| **offline** | Faster-Whisper / sherpa / PhoWhisper | NLLB (CTranslate2) / SeaLLM | Model tải về máy |

TTS tách rời khỏi chế độ STT/NMT — luôn chọn theo `TTS_ENGINE` (mặc định `edge`,
giọng online miễn phí). Vì vậy dù dùng cloud hay offline, âm thanh vẫn phát bình thường.

### Chuẩn bị model cho chế độ offline (tùy chọn)

```bash
python tools/prepare_nllb.py            # tải NLLB (CTranslate2 int8) cho dịch offline
python tools/prepare_phowhisper.py      # build PhoWhisper (STT tiếng Việt offline)
python tools/download_sherpa_models.py  # tải model sherpa-onnx (STT offline)
```
Sau khi build, trỏ đường dẫn tương ứng trong `.env` (`OFFLINE_NMT_MODEL_DIR`,
`PHOWHISPER_MODEL_DIR`, ...) và đặt `STT_ENGINE` / `NMT_ENGINE` phù hợp.

---

## 6. Cấu trúc dự án

```
OpenNezt-PTIT/
├── backend/          # FastAPI + WebSocket pipeline STT→NMT→TTS
│   ├── app/          # main.py (/ws), ws/handler.py, providers/, core/
│   ├── tools/        # script kiểm tra & chuẩn bị model
│   ├── static/       # console test trình duyệt (phục vụ ở /app)
│   └── .env.example  # mẫu cấu hình
├── frontend/         # App Expo / React Native
│   └── src/screens/rtt/   # luồng dịch trực tiếp (Demo1..Demo8)
└── CLAUDE.md         # tài liệu kiến trúc chi tiết cho lập trình viên
```

Muốn hiểu sâu kiến trúc (mô hình provider, luồng ghép cặp, giao thức WebSocket),
đọc [CLAUDE.md](CLAUDE.md) và [frontend/claude.md](frontend/claude.md).

---

## 7. Xử lý sự cố thường gặp

| Vấn đề | Cách xử lý |
|--------|-----------|
| Hai máy không thấy nhau | Kiểm tra cùng mạng LAN, backend chạy `--host 0.0.0.0`, đã mở tường lửa cổng 8000, WS URL đúng IP |
| Không có âm thanh dịch | Bật TTS (client gửi `config.update {ttsOn}`); kiểm tra `TTS_ENGINE=edge` và máy có internet (edge-tts là dịch vụ online) |
| Lỗi thiếu Groq key | Đặt `GROQ_API_KEY` trong `.env`, hoặc dùng `DEFAULT_MODE=mock` để chạy thử |
| Micro không hoạt động trên web | Dùng `localhost` hoặc https; trên máy thật dùng Expo Go |
| `Unable to open file 'model.bin' in model '...-ct2-int8'` | Chưa build model offline. Cài PyTorch CPU (`pip install torch --index-url https://download.pytorch.org/whl/cpu`) rồi chạy `python tools/prepare_nllb.py`. Hoặc đổi `DEFAULT_MODE=mock`/`cloud` nếu không cần offline |
| In tiếng Việt bị lỗi ký tự (Windows) | Đặt biến môi trường `PYTHONIOENCODING=utf-8` |
