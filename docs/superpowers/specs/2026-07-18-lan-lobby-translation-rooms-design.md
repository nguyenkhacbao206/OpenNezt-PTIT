# Spec: LAN lobby + phòng dịch 1↔1 (nói máy này → máy kia dịch + phát audio)

Ngày: 2026-07-18 · Trạng thái: Chờ review

## 1. Context / Vấn đề

App RTT (Expo/React Native, vừa merge) hiện là **self-loop**: một máy thu → WS của
chính nó chạy STT→NMT→TTS → kết quả **về lại chính máy đó**. Các màn "thiết bị / lời
mời / người nghe" (Demo2/3/5) chỉ là **UI mock, dữ liệu cứng, không có mạng**. Backend
`/ws` tạo `SessionState` **cục bộ mỗi kết nối**, **không** có registry, **không** phòng,
**không** định tuyến kết quả sang máy khác.

Mục tiêu: hai máy **cùng mạng** thấy nhau, **ghép đôi (1↔1)**, tạo "chat nội bộ" — nói ở
máy này thì **máy kia** nhận **bản dịch + phát audio**, và ngược lại.

## 2. Goals / Non-goals

**Goals**
- Lobby qua backend: mọi máy trỏ WS tới cùng server LAN → thấy danh sách "thiết bị cùng
  mạng" (các client đang online), mời & ghép phòng.
- Phòng **1↔1 hai chiều**: A nói (langA) → B nhận bản dịch langB + audio langB; và ngược lại.
- Tái dùng nguyên pipeline STT/NMT/TTS (edge-tts) + hàng đợi phát audio đã có.

**Non-goals**
- Không nhóm >2 máy; không auth; không mDNS/P2P; không lưu lịch sử ở server; không đổi
  provider pattern. Discovery = "cùng server LAN" (client tự đặt WS URL ở Demo1).

## 3. Kiến trúc

### 3.1 Backend — thêm registry + phòng (mới), giữ pipeline cũ
- **`app/ws/rooms.py` (MỚI) — `ConnectionManager` (singleton, RAM):**
  - `clients: dict[client_id -> Client]`, `Client = { id, ws, name, lang, room_id | None }`.
  - `register(ws, name, lang) -> client_id` (server sinh id ngắn); `unregister(client_id)`.
  - `lobby_snapshot() -> [{clientId, name, lang, busy}]` (busy = đang trong phòng).
  - `broadcast_lobby()` — gửi `lobby` tới mọi client KHÔNG ở trong phòng.
  - `invite(from_id, to_id)`, `accept(a_id, b_id) -> room_id`, `decline(...)`, `leave(id)`.
  - `peer_id_of(id)`, `client(id)`, `send_to(client_id, event, data)` (best-effort).
- **`app/core/session.py`** — thêm `client_id: str | None`, `peer_id: str | None`,
  `room_id: str | None` vào `SessionState` (mặc định None → giữ hành vi self-loop cho
  console `/app`).
- **`app/main.py`** — trên `/ws`: tạo `SessionState` như cũ; truyền `ConnectionManager`
  (từ `app.state`) vào vòng dispatch. `finally`: `manager.unregister(session.client_id)`
  → thông báo peer `room.closed` + `broadcast_lobby()` + `session.cleanup()`.
- **`app/ws/handler.py`** — thêm route + định tuyến (dưới).

### 3.2 Định tuyến kết quả (điểm cốt lõi)
Trong `_on_audio_chunk` / `_on_audio_partial`: sau khi có kết quả, dùng helper
`route_result(session, ws, manager, event, data)`:
- Nếu `session.peer_id` (đang trong phòng): **`stt.*` + `metrics` → gửi cho CHÍNH mình
  (ws)**; **`nmt.result` + `tts.audio` → `manager.send_to(session.peer_id, ...)`**.
- Nếu không có peer (console/solo): gửi tất cả về `ws` (y như hiện tại — **tương thích ngược**).

Chiều dịch lấy từ phòng: khi vào phòng, `session.source_lang = own lang`,
`session.target_lang = peer lang`. Vì thế A nói langA luôn dịch sang langB.

## 4. Giao thức WS (thêm; giữ nguyên audio.chunk/partial, session.*, config.update)

**Client → Server**
- `hello { name, lang }` — vào lobby. (Server đặt `session.client_id`, `source_lang=lang`.)
- `invite { toClientId }`
- `invite.accept { fromClientId }` · `invite.decline { fromClientId }`
- `room.leave {}`

**Server → Client**
- `welcome { clientId }`
- `lobby { devices: [{ clientId, name, lang, busy }] }`  (phát khi có thay đổi)
- `invite.incoming { fromClientId, fromName, fromLang }`
- `invite.declined { fromClientId }`
- `room.joined { roomId, peer: { clientId, name, lang } }`
- `room.closed { reason }`  (peer rời / mất kết nối / tự rời)

## 5. Luồng dữ liệu (A nói, trong phòng A↔B)
```
A: audio.chunk ─▶ backend (session A: src=langA, tgt=langB, peer=B)
   STT(langA)         ─▶ stt.partial/final ─▶ A   (thấy mình vừa nói)
   NMT(langA→langB)   ─▶ nmt.result        ─▶ B   (đọc bản dịch)
   TTS(langB, edge)   ─▶ tts.audio         ─▶ B   (audioPlayback phát ở máy B)
   metrics            ─▶ A
```
Chiều B→A đối xứng. Cả hai màn Meeting hiển thị hội thoại: câu MÌNH nói (gốc) +
câu PEER gửi tới (đã dịch sang tiếng mình) kèm audio tự phát.

## 6. Frontend (Expo RTT) — nối màn mock thành thật

- **`store/slices/translatorSlice.ts`**: thêm state `myClientId`, `myName`,
  `devices: Device[]`, `room: { roomId, peer } | null`, `incomingInvite | null`,
  `lobbyStatus`. Thêm action: `hello()`, `invite(toId)`, `acceptInvite(fromId)`,
  `declineInvite(fromId)`, `leaveRoom()`. `handleEvent` xử lý các event mới ở §4 (cập
  nhật devices/room/incomingInvite). Khi vào phòng, đặt `srcLang=own`, `dstLang=peer.lang`.
- **`types/translator.ts`**: thêm các message/event mới ở §4 + `KNOWN_EVENTS` (trong
  `translatorService.ts`).
- **Demo1Language**: đặt lang + **tên máy** (mặc định tự sinh, cho sửa) + WS URL → `connect()`
  → gửi `hello` → sang **Devices**.
- **Demo2Devices**: thay `DEVICES` cứng bằng `devices` (state). Nút **Mời** → `invite(id)`,
  hiện "Đang chờ…". Nhận `invite.incoming` → sang **Invite** (bên nhận).
- **Demo3Invite**: bắt tay thật — bên nhận **Chấp nhận** → `acceptInvite`; có `room.joined`
  → cả hai vào **Meeting**. Từ chối → `declineInvite`.
- **Demo4Meeting** (màn phòng chính, chứa cả hội thoại hai chiều): hiện danh sách câu —
  câu MÌNH nói (gốc) + câu PEER gửi tới (đã dịch sang tiếng mình). `tts.audio` từ peer **tự
  phát** (audioPlayback hàng đợi). Khi peer đang nói, hiện dải "peer đang nói…". PTT →
  **YourTurn**. "Kết thúc" → `leaveRoom()` + `disconnect()`.
- **Demo6YourTurn**: giữ `useMeetingMic` (đã chạy). Kết quả tự route sang peer (backend lo).
- **Demo5ListenerView**: MVP **KHÔNG bắt buộc** — hội thoại + phát audio nằm trong Meeting.
  Giữ Demo5 làm chế độ "toàn màn hình cho người nghe" (tuỳ chọn, có thể làm sau); nếu làm,
  nó đọc cùng state hội thoại/`live` như Meeting.

## 7. Xử lý biên
- Mời người đang bận (`busy`) → server trả `error`/`invite.declined{reason:"busy"}`.
- Peer rời/mất mạng khi đang trong phòng → cả hai nhận `room.closed`, quay về lobby.
- Hai máy mời chéo nhau đồng thời → server chỉ lập 1 phòng cho cặp (idempotent theo cặp).
- Client disconnect ở lobby → `broadcast_lobby()` cập nhật.
- Console `/app` (không gửi `hello`) → `peer_id=None` → self-loop như cũ (không vỡ).

## 8. Zero-retention & tái dùng
- Buffer audio/text vẫn per-connection, xoá khi disconnect. Registry/room chỉ trong RAM,
  không ghi đĩa. Không đổi provider pattern; `send_to` chỉ là fan-out transport.

## 9. Verify / Test
1. **Backend (in-process, 2 client):** dùng `fastapi.testclient` mở **2** WebSocket A,B:
   A `hello{vi}`, B `hello{en}` → cả hai nhận `lobby` chứa nhau. A `invite{B}` → B nhận
   `invite.incoming`. B `invite.accept{A}` → cả hai nhận `room.joined` với peer đúng.
   A gửi `audio.chunk` (wav tiếng Anh giả lập en→? — hoặc mock mode) → **B** nhận
   `nmt.result` + `tts.audio`, **A** nhận `stt.*`+`metrics`. Peer đóng → bên kia nhận
   `room.closed`.
2. **Console không vỡ:** `/app` (không `hello`) vẫn self-loop (STT→NMT→TTS về chính nó).
3. **Frontend:** `tsc --noEmit` + `eslint` sạch (sau `npm install`). Thử 2 thiết bị/2 tab
   cùng trỏ 1 WS URL LAN: thấy nhau → mời → vào phòng → nói bên này, bên kia nghe + đọc.

## 10. File dự kiến đụng
- Backend: `app/ws/rooms.py` (mới), `app/ws/handler.py`, `app/main.py`, `app/core/session.py`.
- Frontend: `store/slices/translatorSlice.ts`, `types/translator.ts`, `services/translatorService.ts`,
  `screens/rtt/Demo1Language.tsx`, `Demo2Devices.tsx`, `Demo3Invite.tsx`, `Demo4Meeting.tsx`,
  `Demo5ListenerView.tsx` (và `Demo6YourTurn.tsx` nếu cần).
