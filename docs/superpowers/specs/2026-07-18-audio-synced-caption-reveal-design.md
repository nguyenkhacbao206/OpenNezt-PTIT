# Đồng bộ hiệu ứng chạy chữ (hero caption) với TTS audio

**Ngày:** 2026-07-18
**Phạm vi:** `frontend/` — màn Meeting (`Demo4Meeting.tsx`), store
(`translatorSlice.ts`), service `audioPlayback.ts`. Không đụng backend / giao
thức WS.

## Vấn đề

Ở màn Meeting, chữ hero (`useReveal` trong `Demo4Meeting.tsx`) chạy từng từ với
nhịp **cố định 55ms/từ**, hoàn toàn độc lập với audio TTS. `audioPlayback.ts` là
hàng đợi fire-and-forget, **không báo** cho UI biết audio bắt đầu khi nào và dài
bao lâu.

Với luồng người NGHE (xác nhận trong `backend/app/ws/handler.py`): trong lúc đối
tác giữ nút, listener nhận `nmt.partial` (chữ dịch dự đoán chạy trước); khi đối
tác thả nút mới nhận `nmt.result` + `tts.audio` (bản chốt + tiếng). Vì chữ dự
đoán chạy nhịp cố định nên **luôn hiện xong trước khi audio kịp phát** → chữ và
tiếng lệch pha.

## Mục tiêu

Khi bản dịch chốt + audio về, chữ hero **nhảy khớp cùng lúc audio phát**: bắt đầu
đúng lúc audio bắt đầu, và chạy hết trong đúng độ dài audio.

## Quyết định thiết kế (đã chốt với người dùng)

- **Cách sync:** ① *Reset & gõ lại khớp audio*. Giữ nguyên preview dịch dự đoán
  (`nmt.partial`) chạy nhanh. Khi bản chốt `nmt.result` + `tts.audio` về, hero
  **reset về đầu và gõ lại**, nhịp = độ dài audio ÷ số từ, bắt đầu đúng lúc audio
  phát. Vẫn giữ được cảm giác dịch real-time (điểm mạnh dự án —
  `streaming-predictive-translation`).
- **Fallback:** *Chờ ngắn rồi gõ nhịp thường*. Nếu bản chốt về mà không có tín
  hiệu audio khớp trong ~400ms (web chưa tương tác nên `play()` bị chặn, tắt loa,
  hoặc `ttsOn=false`), hero gõ theo nhịp cố định 55ms như hiện tại. Không bao giờ
  kẹt chữ.

## Kiến trúc & thành phần

Ba đơn vị, mỗi cái một trách nhiệm rõ, giao tiếp qua interface hẹp — tôn trọng
ranh giới layer trong `frontend/claude.md` (service không import store).

### 1. `services/audioPlayback.ts` — báo ngược thời điểm & độ dài audio

- Đổi chữ ký: `playBase64Audio(base64: string, onStart?: (durationMs: number) => void): void`.
  `onStart` là tùy chọn; gọi cũ không tham số vẫn chạy nguyên.
- `onStart` được gọi **một lần** cho clip khi nó thực sự bắt đầu phát, kèm độ dài
  clip (ms). Không gọi nếu clip bị bỏ qua/lỗi.
  - **Web:** trong nhánh `Platform.OS === 'web'`, sau khi `await audio.play()`
    thành công, đọc `audio.duration` (giây). Nếu đã có metadata → gọi ngay; nếu
    `duration` còn `NaN`/`0`, đăng ký `audio.onloadedmetadata` để gọi khi có.
    `durationMs = audio.duration * 1000`.
  - **Native:** trong `playbackStatusUpdate`, lần đầu thấy `status.playing` (hoặc
    `status.isLoaded`) với `duration > 0`, gọi `onStart(duration_ms)` đúng một
    lần (dùng cờ cục bộ để không gọi lặp).
- Hàng đợi tuần tự (`queue`/`busy`/`playNext`) giữ nguyên. `onStart` được luồn
  theo từng clip qua hàng đợi (đổi `queue` từ `string[]` sang
  `{ base64: string; onStart?: (n: number) => void }[]`).
- **Không** import store — chỉ trả tín hiệu qua callback do caller truyền vào.

### 2. `store/slices/translatorSlice.ts` — cầu nối bằng `audioCue`

- Thêm state:
  `audioCue: { turnId: string; startedAt: number; durationMs: number } | null`.
- Turn của đối tác tạo ở nhánh `nmt.result` đã có `id` (`makeId()`). Khi tạo
  turn đó, nhớ `id` để gắn cho audio kế tiếp (dùng biến/ref trong slice, ví dụ
  lưu `_lastPeerTurnId`).
- Nhánh `tts.audio` đổi từ `void playBase64Audio(event.data.audio)` thành:
  ```ts
  const turnId = get()._lastPeerTurnId;
  void playBase64Audio(event.data.audio, (durationMs) => {
    if (turnId) set({ audioCue: { turnId, startedAt: Date.now(), durationMs } });
  });
  ```
  (giữ nguyên điều kiện `if (get().ttsOn)`).
- Reset `audioCue = null` (và `_lastPeerTurnId`) tại: `room.joined`, khi bắt đầu
  một lượt nói mới của mình (`stt.final` tạo `mine` turn), và `clearTurns`.
- `Date.now()` dùng bình thường ở app runtime (giới hạn Date.now chỉ áp cho
  Workflow script, không phải mã app).

### 3. `useReveal` trong `Demo4Meeting.tsx` — pace theo audio

- Mở rộng chữ ký: `useReveal(text: string, opts?: { syncMs?: number; syncKey?: string; cadence?: number }): string`.
  - `syncKey` đổi ⇒ coi như lượt mới: reset `iRef = 0`, gõ lại từ đầu (đây là
    cơ chế "reset & gõ lại").
  - `syncMs` có giá trị ⇒ `cadence = clamp(syncMs / wordCount, 40, 400)` để chữ
    chạy trọn độ dài audio; không có ⇒ dùng `cadence` mặc định 55ms.
- Trong screen, tính cue cho hero **chỉ khi đang nghe lượt đối tác**:
  ```ts
  const heroTurnId = !speaking ? (live ? undefined : lastPeer?.id) : undefined;
  const cue = audioCue && audioCue.turnId === heroTurnId ? audioCue : null;
  const typed = useReveal(heroBig, { syncMs: cue?.durationMs, syncKey: heroTurnId });
  ```
- **Fallback ~400ms:** khi hero khoá vào turn đối tác mới (`heroTurnId` đổi) mà
  chưa có `cue` khớp, chờ tối đa ~400ms rồi gõ nhịp thường. Cụ thể: nếu `syncMs`
  chưa có, `useReveal` vẫn khởi động gõ nhịp 55ms ngay (không đợi) — nhưng để
  audio kịp đồng bộ, hoãn *bắt đầu* gõ tối đa 400ms kể từ khi `syncKey` đổi; nếu
  trong 400ms có `syncMs` thì gõ khớp audio, hết 400ms mà chưa có thì gõ 55ms.
  (Triển khai bằng một `setTimeout(…, 400)` trong effect của `useReveal` khi
  `syncKey` mới và chưa có `syncMs`.)
- Khi **mình nói** (`speaking`): không truyền cue ⇒ giữ gõ nhanh như hiện tại
  (không có audio về máy mình).

## Luồng dữ liệu (người nghe)

```
đối tác giữ nút
  → nmt.partial (nhiều)  → live.dstText cập nhật → hero preview gõ nhanh (55ms)
đối tác thả nút
  → nmt.result           → thêm peer turn (id=X), live=null,
                           hero khoá vào turn X (syncKey đổi → reset index=0),
                           _lastPeerTurnId=X
  → tts.audio            → playBase64Audio(audio, onStart)
       onStart(durMs)    → set audioCue={turnId:X, startedAt, durationMs:durMs}
                           → useReveal thấy syncMs → gõ lại từ đầu, khớp độ dài audio
```

Nếu `tts.audio` không phát được (play bị chặn / tắt loa / ttsOn=false):
`onStart` không bao giờ chạy → sau 400ms hero gõ nhịp 55ms cố định.

## Xử lý lỗi & biên

- Audio web bị chặn (`await audio.play()` throw): nhánh catch gọi `advance()` như
  cũ, `onStart` không chạy → fallback 400ms lo phần chữ.
- `wordCount === 0` (chữ rỗng): `useReveal` trả rỗng, không chia cho 0.
- Nhiều clip cho một lượt (backend cắt segment): `onStart` báo theo clip đầu
  đang phát; `audioCue.durationMs` là của clip đầu. Chấp nhận — hero pace theo
  clip đầu; đây là xấp xỉ đủ tốt, không cần cộng dồn toàn bộ hàng đợi.
- `syncKey` đổi giữa chừng (lượt mới tới khi lượt cũ chưa gõ xong): reset về đầu
  theo turn mới — đúng hành vi mong muốn.

## Kiểm thử

Không có pytest cho frontend; kiểm thử bằng tay theo hướng dẫn test phòng họp
(2 tab web localhost hoặc 2 điện thoại LAN, mode `cloud` hoặc `edge` TTS để có
audio thật):

1. **Khớp cơ bản:** đối tác nói một câu dài → trên máy nghe, chữ hero bắt đầu gõ
   đúng lúc nghe tiếng, và gõ xong gần lúc tiếng dứt.
2. **Preview vẫn chạy:** trong lúc đối tác còn giữ nút, chữ dự đoán vẫn hiện chạy
   nhanh; khi thả nút chữ reset và gõ lại khớp audio.
3. **Fallback tắt loa:** tắt `ttsOn` (không có `tts.audio`) → chữ vẫn gõ nhịp
   55ms sau ~400ms, không kẹt, không chờ vô hạn.
4. **Fallback web chưa tương tác:** mở tab mới chưa click → audio bị chặn → chữ
   vẫn hiện qua fallback.
5. **Lượt liên tiếp:** đối tác nói 2 câu liên tiếp → mỗi câu reset và gõ khớp
   audio của chính nó.
6. **Mình nói:** giữ nút nói → hero (lời mình) gõ nhanh như cũ, không bị hoãn
   400ms.
7. `npm run typecheck` và `npm run lint` sạch.

## Không nằm trong phạm vi

- Đồng bộ mức từ (word-level timestamp) — TTS không trả mốc thời gian từng từ;
  chỉ pace theo tổng độ dài clip.
- Cộng dồn độ dài nhiều clip cho một lượt.
- Nút "Xuất bản ghi" / phát lại audio trong màn History (hạng mục khác).
- Backend, giao thức WS, mặc định `ttsOn`.
