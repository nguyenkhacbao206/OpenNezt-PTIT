# OpenNezt Desktop (Electron)

App desktop đóng gói: **UI + backend nhúng + discovery LAN** kiểu "Open to LAN"
(Minecraft/AirDrop). Mở app trên nhiều máy cùng WiFi → tự thấy nhau, không cần
gõ IP, không cần server trung tâm cấu hình sẵn.

## Kiến trúc

```
App.exe (mỗi máy giống hệt nhau)
├─ UI          : bản Expo Web export (web-dist/), nạp trong cửa sổ Electron
├─ Backend     : uvicorn (dev) / exe PyInstaller (prod) — STT/NMT/TTS offline
├─ Discovery   : UDP broadcast + listen (discovery.js, dùng Node dgram)
└─ Bridge      : preload.js → window.desktop cho UI đọc danh sách thiết bị
```

- **discovery.js** — phát gói `{id,name,ip,ws}` mỗi 1.5s, nghe gói máy khác, loại
  peer quá 5s không thấy. Đối xứng: mọi máy vừa phát vừa nghe.
- **backend.js** — spawn backend + poll `/` tới khi health OK.
- **main.js** — ghép 3 phần + IPC + vòng đời cửa sổ.
- **preload.js** — expose `window.desktop = { getSelf, onDevices, setName }`.

## Chạy DEV

Cần: Node ≥18, Python + backend đã cài deps & model offline (xem backend/.env:
`DEFAULT_MODE=offline`, đã tải NLLB + Whisper + Piper).

```bash
cd desktop
npm install

# Cách A — nạp UI từ Expo web dev server (hot reload):
#   terminal 1:  cd ../frontend && npx expo start --web   (chạy ở cổng 8081)
#   terminal 2:
npm run dev:web

# Cách B — nạp UI đã export (giống prod), backend chạy bằng python:
npm run build:web      # export Expo web -> desktop/web-dist/
npm run dev            # DESKTOP_DEV=1 → backend spawn bằng `python -m uvicorn`
```

Mở app trên 2 máy cùng WiFi → mỗi máy tự thấy máy kia trong danh sách (qua
`window.desktop.onDevices`).

## Đóng gói PROD (.exe)

1. **Đóng gói backend** thành exe (PyInstaller) và đặt vào `desktop/resources/backend/`:
   ```bash
   cd ../backend
   pyinstaller --onefile --name opennezt-backend run_server.py   # (script gọi uvicorn)
   # copy dist/opennezt-backend.exe  ->  ../desktop/resources/backend/
   # kèm cả thư mục models/ (NLLB, Whisper, Piper) cạnh exe hoặc trỏ path qua env
   ```
2. **Export UI**: `npm run build:web`
3. **Build app**: `npm run dist` → ra installer trong `desktop/dist/`.

> Lưu ý model offline nặng (~1.5–3GB). Cân nhắc đặt models/ làm extraResources
> hoặc cho tải lần đầu.

## Việc còn lại (wire UI)

Khung này đã cung cấp `window.desktop`. Bước tiếp theo (phía frontend): thêm màn
"Thiết bị cùng mạng" đọc `window.desktop.onDevices(...)` → bấm một thiết bị →
`setWsUrl(device.ws)` → vào lobby/room như hiện tại. Khi không có `window.desktop`
(chạy web thường) thì fallback về nhập WS URL tay.

## Giới hạn

- **AP isolation** (WiFi trường/quán) chặn UDP broadcast → không thấy nhau. Mạng
  nhà/văn phòng bình thường thì chạy tốt. Luôn giữ fallback nhập IP tay.
- Cần model offline đã tải sẵn để backend chạy không cần internet.
