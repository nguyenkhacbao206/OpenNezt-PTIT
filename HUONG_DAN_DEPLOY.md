# Deploy demo (Docker + WebSocket)

Console phiên dịch cần **WebSocket** → **không dùng Vercel** (serverless, không giữ WS,
không chạy Docker server nền). Dùng nền tảng hỗ trợ Docker + WebSocket. Backend tự phục
vụ cả trang demo (`/app`) lẫn WS (`/ws`) nên chỉ deploy **backend** là đủ một link.

Ảnh Docker chỉ cài deps cho **cloud mode** (Groq + edge-tts) — nhẹ, không có gói offline.

## Cách 1 — Render.com (khuyến nghị, free, dễ nhất)

1. Push repo lên GitHub (đã có `render.yaml`, `backend/Dockerfile`).
2. Vào https://dashboard.render.com → **New → Blueprint** → chọn repo → Render đọc
   `render.yaml` và tạo service Docker.
   - (Hoặc **New → Web Service** → chọn repo → Runtime **Docker**, Dockerfile
     `backend/Dockerfile`, Context `backend`.)
3. **Environment** → thêm biến bí mật (KHÔNG commit):
   - `GROQ_API_KEY`, `GROQ_STT_API_KEY`, `GROQ_NMT_API_KEY` = key Groq của bạn.
   - (`DEFAULT_MODE=cloud`, `TTS_ENGINE=edge` đã có sẵn trong blueprint.)
4. Deploy. Link demo: **`https://<tên-service>.onrender.com/app`**
   - WS tự dùng `wss://<host>/ws` (không cần sửa gì).
   - Health check ở `/`. Free tier ngủ sau ~15' không dùng → lần mở đầu chờ ~30s.

## Cách 2 — Chạy thử Docker ở máy (trước khi deploy)

```bash
cd backend
docker build -t translator-demo .
docker run --rm -p 8000:8000 \
  -e GROQ_API_KEY=gsk_... \
  -e GROQ_STT_API_KEY=gsk_... \
  -e GROQ_NMT_API_KEY=gsk_... \
  -e DEFAULT_MODE=cloud -e TTS_ENGINE=edge \
  translator-demo
# Mở http://localhost:8000/app
```

## Nền tảng khác (cùng Docker này)
- **Railway** / **Fly.io** (`fly launch` đọc Dockerfile) / **Google Cloud Run**
  (`gcloud run deploy --source backend`) / **Hugging Face Spaces (Docker SDK)**.
  Tất cả hỗ trợ WebSocket. Đặt các biến `GROQ_*` trong phần secrets của nền tảng.
  Ảnh đọc `$PORT` do nền tảng cấp (fallback 8000).

## Lưu ý
- **Không** đưa key vào ảnh Docker (`.env` đã nằm trong `.dockerignore`). Đặt qua env của
  nền tảng.
- Cần internet ra ngoài (Groq + edge-tts) — mọi nền tảng trên đều cho.
- Demo chạy **cloud mode**; chọn offline/piper trên bản deploy sẽ lỗi (không cài gói nặng).

---

# Đóng gói bản chạy offline (.exe cho Windows)

Khác với Docker (cloud mode, cần internet), bản `.exe` là **backend offline standalone**:
gói sẵn cả 3 tầng STT (Faster-Whisper) + NMT (NLLB-200) + TTS (Piper) bằng
**PyInstaller**, chạy trên máy Windows không cần cài Python. Dùng khi cần chạy tại chỗ
trong mạng LAN, không phụ thuộc mạng ngoài.

## Môi trường build (quan trọng)

Bản exe **KHÔNG build bằng venv** (`.venv` không có PyInstaller). Dùng **system Python
3.10** đã cài PyInstaller:

- Python: `C:\Users\admin\AppData\Local\Microsoft\WindowsApps\python.exe` (Python 3.10.11)
- PyInstaller: 6.20.0
- Entry point: `run_server.py`
- Cấu hình đóng gói: `backend/opennezt-backend.spec` (đã khai báo sẵn hiddenimports +
  `collect_all` cho faster_whisper, ctranslate2, onnxruntime, transformers, tokenizers,
  sentencepiece, piper).

> Nếu máy khác chưa có PyInstaller trong Python này:
> `& "C:\...\WindowsApps\python.exe" -m pip install pyinstaller`

## Lệnh build

Chạy từ thư mục `backend/` (PowerShell):

```powershell
Set-Location "D:\VAIC\OpenNezt-PTIT\backend"
$py = "C:\Users\admin\AppData\Local\Microsoft\WindowsApps\python.exe"
& $py -m PyInstaller --noconfirm --clean opennezt-backend.spec *>&1 |
  Tee-Object -FilePath pyinstaller_build.log | Select-Object -Last 8
```

- `--noconfirm`: ghi đè `dist/` cũ không hỏi. `--clean`: xoá cache build trước.
- Build mất ~3–4 phút. Thành công khi log kết thúc: `Build complete! ... available in ... dist`.
- Không cần sửa spec khi đổi code trong `app/` — spec dùng `collect_submodules('app')` nên
  mọi thay đổi (vd `app/ws/handler.py`) tự được đóng gói lại.

## Kết quả & chạy thử

- Output: `backend/dist/opennezt-backend/opennezt-backend.exe` (kèm thư mục `_internal/`).
  **Phân phối cả thư mục `dist/opennezt-backend/`**, không chỉ mỗi file .exe.
- Smoke-test nhanh:

```powershell
Start-Process ".\dist\opennezt-backend\opennezt-backend.exe"
# đợi ~10s rồi kiểm tra health:
Invoke-WebRequest "http://127.0.0.1:8000/" -UseBasicParsing | Select-Object -Expand Content
# Kỳ vọng: {"status":"ok","service":"vi-en-meeting-translator","defaultMode":"offline",...}
```

- Mở console demo: `http://localhost:8000/app`. Cho máy LAN khác truy cập: mở firewall
  TCP 8000, các máy trỏ `ws://<lan-ip>:8000/ws` (xem `CLAUDE.md` phần chạy 2 máy).

## Lưu ý
- exe chạy **offline mode** mặc định — cần các model đã có trong `backend/models/`
  (nllb-200…, tts/{vi,en}). Model **không** nằm trong exe; giữ cạnh hoặc cấu hình qua `.env`.
- Model Whisper tải lần đầu về cache `~/.cache/huggingface` — chạy thử 1 lần lúc có mạng
  để nạp sẵn nếu máy đích không có internet.
- Log build được lưu ở `backend/pyinstaller_build*.log` (không cần commit).
