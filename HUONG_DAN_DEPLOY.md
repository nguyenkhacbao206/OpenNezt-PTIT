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
