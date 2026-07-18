# Dịch + đọc cuốn chiếu theo cụm (VAD segmentation)

**Ngày:** 2026-07-18
**Phạm vi:** `frontend/` — `services/webAudioCapture.ts`,
`components/hooks/useMeetingMic.ts`, `screens/rtt/Demo4Meeting.tsx`. **Không đụng
backend / giao thức WS.**

## Vấn đề

Ở màn Meeting, một lần push-to-talk = MỘT turn: trong lúc giữ nút app chỉ gửi
`audio.partial` (STT+NMT tạm, **không** TTS); TTS chỉ nổ khi **thả nút**
(`audio.chunk`). Nên người nghe chỉ nghe bản dịch sau khi người nói nói xong cả
lượt — không có "đọc cuốn chiếu".

Client tham chiếu `backend/static/index.html` làm khác: VAD năng lượng client-side
cắt lời thành **cụm** (phrase); mỗi cụm gửi `audio.chunk` ngay khi đang nói →
backend STT+NMT+TTS → audio từng cụm phát cuốn chiếu qua hàng đợi tuần tự. Kết
quả: đang nói cụm 2 thì cụm 1 đã được đọc.

App RN đã có sẵn mảnh ghép nhưng chưa nối: `useMeetingMic.cut()` (flush +
`commitSegment` → `audio.chunk`) tồn tại nhưng **không ai gọi**;
`services/audioPlayback.ts` đã phát tuần tự (hàng đợi). `WebMicRecorder` gom hết
frame nhưng **không tính RMS / không dò cụm**.

## Mục tiêu

App Meeting cắt cụm tự động khi đang nói (giống index.html), để bản dịch + audio
từng cụm phát cuốn chiếu trên máy người nghe trong khi người nói tiếp tục.

## Quyết định thiết kế (đã chốt với người dùng)

1. **Cắt cụm bằng VAD năng lượng** (giống index.html), không phải theo giờ.
2. **Web trước** (bề mặt test chính — 2 tab localhost) có VAD thật; **native**
   (điện thoại) cắt cưỡng bức **theo giờ** (~4s) qua `cut()` sẵn có.
3. **Bỏ dịch dự đoán** (`audio.partial`) trong luồng mic — thuần cụm như
   index.html: mỗi cụm chỉ gửi `audio.chunk`.

## Kiến trúc & thành phần

Chỉ frontend, ba đơn vị. Backend không đổi: đã xử lý mỗi `audio.chunk` =
STT→NMT→TTS và route `tts.audio` sang peer; nhiều `audio.chunk` trong một session
là hợp lệ.

### 1. `services/webAudioCapture.ts` — VAD trong `WebMicRecorder`

- Trạng thái VAD nội bộ: `speaking: boolean`, `silenceMs: number`,
  `segMs: number`.
- `start(onSegment?: () => void): Promise<void>` — nhận callback biên cụm; lưu
  vào `this.onSegment`.
- Trong `onaudioprocess(e)`:
  - Tính `rms` của frame; `frameMs = frame.length / inRate * 1000`.
  - `if (rms > SPEECH_RMS) { speaking = true; silenceMs = 0; }`
    `else if (speaking) { silenceMs += frameMs; }`
  - **Chỉ gom frame khi `speaking`**: `if (speaking) { chunks.push(frame); segMs += frameMs; }`
    (bỏ im lặng đầu/giữa cụm — giống index.html).
  - Biên cụm: `if ((speaking && silenceMs >= SILENCE_MS && segMs >= MIN_SEG_MS) || segMs >= MAX_SEG_MS)`
    → reset `speaking=false; silenceMs=0; segMs=0;` rồi gọi `this.onSegment?.()`.
    (Không tự `reset()` chunks ở đây — caller đọc `windowWav()` xong mới
    `reset()`, tránh mất frame.)
- Giữ nguyên `windowWav()` / `reset()` / `stop()`. Vì chỉ gom frame khi
  `speaking`, `windowWav()` = audio cụm hiện tại (speech-only).
- Hằng số (đầu file): `SPEECH_RMS = 0.012`, `SILENCE_MS = 650`,
  `MIN_SEG_MS = 500`, `MAX_SEG_MS = 6000`.

### 2. `components/hooks/useMeetingMic.ts` — cụm thay vì partial

- **Web:** ở `start()`, truyền callback vào `webRef.current.start(onSegment)`.
  Callback:
  ```ts
  const wav = webRef.current?.windowWav() ?? null;
  webRef.current?.reset();
  if (wav) commitSegment(speakerRef.current, wav);
  ```
  Dùng ref cho callback (`onSegmentRef`) để luôn gọi bản mới nhất mà không đăng
  ký lại recorder. **Bỏ** nhánh web trong `onTick`/timer gửi partial.
- **Native:** giữ `timerRef` nhưng đổi chu kỳ và hành vi — mỗi `NATIVE_SEG_MS`
  (≈4000) gọi `cut()` (đã có: `flushNative(true)` + `commitSegment`) thay cho
  `sendPartialAudio`. Bỏ logic coalesce (`awaitingRef`/`COALESCE_TIMEOUT`) khỏi
  đường cắt — cụm đã cách nhau ~4s.
- `stop()` → `endTurn` (cụm cuối) giữ nguyên; chạy chung cả hai nền.
- Web không còn cần `SEGMENT_MS` timer (VAD tự cắt). Native dùng
  `NATIVE_SEG_MS`. `sendPartialAudio` không còn được mic gọi (giữ trong store cho
  `/app` & tools).

### 3. `screens/rtt/Demo4Meeting.tsx` — hero bám cụm ĐANG PHÁT audio

- Audio phát cuốn chiếu (hàng đợi) nên trễ hơn lúc chữ về. Nếu hero hiện cụm mới
  nhất, sẽ thấy chữ cụm 3 khi tai nghe cụm 1. Sửa: hero hiện **cụm đang được
  đọc**.
- `const playingTurn = audioCue ? turns.find((t) => t.id === audioCue.turnId) ?? null : null;`
- Khi đang nghe (`!speaking`): ưu tiên `playingTurn`, fallback `lastPeer`.
  - `heroBig = speaking ? live?.srcText || '' : playingTurn?.dstText || lastPeer?.dstText || ''`
  - `heroSrc = speaking ? '' : playingTurn?.srcText || lastPeer?.srcText || ''`
  - `heroTurnId = !speaking ? (playingTurn?.id ?? lastPeer?.id) : undefined`
- `useReveal(heroBig, { syncMs: cue?.durationMs, syncKey: heroTurnId })` với
  `cue = audioCue?.turnId === heroTurnId ? audioCue : null` (như đã xây). Mỗi cụm
  chữ nhảy khớp audio của chính nó; chuyển cụm khi audio chuyển → caption cuốn
  chiếu khớp giọng.
- `live` giờ luôn `null` trong luồng mic (bỏ partial) nên điều kiện `!live` cũ
  thành thừa; bỏ khỏi `heroTurnId` cho gọn.

## Luồng dữ liệu (người nghe)

```
người nói giữ nút, nói liên tục
  VAD phát hiện ngắt hơi (cụm 1)  → commitSegment → audio.chunk
    backend STT+NMT+TTS           → nmt.result (peer turn c1) + tts.audio (c1)
  người nói tiếp tục (cụm 2)
    audio c1 phát (hàng đợi)      → onStart → audioCue={turn:c1} → hero=c1, gõ khớp
  VAD cắt cụm 2                   → audio.chunk → nmt.result c2 + tts.audio c2 (xếp hàng)
  audio c1 xong → audio c2 phát   → audioCue={turn:c2} → hero=c2, gõ khớp
  ...
người nói thả nút                → endTurn → audio.chunk cụm cuối
```

## Xử lý lỗi & biên

- **Cụm rỗng / toàn im lặng:** `windowWav()` trả `null` (không có speech frame) →
  không `commitSegment`. Backend cũng có `is_silence` guard.
- **Mic to/nhỏ:** `SPEECH_RMS` là hằng số chỉnh tay; ghi chú trong code như
  index.html. Ngoài phạm vi: auto-gain.
- **MAX_SEG cắt giữa câu:** chấp nhận (giống index.html) — tránh cụm dài vô hạn.
- **Native khoảng hở:** `cut()` dùng stop/read/restart có gap nhỏ; đã tồn tại từ
  trước, không hồi quy thêm.
- **audioCue trỏ turn đã cũ:** `turns.find` trả `undefined` → hero fallback
  `lastPeer`. Không crash.
- **ttsOn=false:** không có `tts.audio` → không có `audioCue` → hero = `lastPeer`,
  chữ gõ nhịp thường (fallback 400ms đã có). Cụm vẫn hiện chữ, chỉ không có tiếng.

## Kiểm thử

Không có jest ở frontend — gate `npm run typecheck` sạch + quan sát runtime (2 tab
web localhost, mode `cloud`/`edge` để có audio thật):

1. **Cuốn chiếu:** nói một câu dài có ngắt hơi (vd "Xin chào … tôi tên là Nam …
   rất vui được gặp bạn") giữ nút liên tục → trên máy nghe: audio cụm 1 phát khi
   người nói còn đang nói cụm 2; các cụm phát lần lượt không đè.
2. **Hero bám giọng:** chữ hero hiện đúng cụm đang nghe, chuyển cụm khi audio
   chuyển; chữ nhảy khớp audio từng cụm.
3. **Cắt theo VAD:** cụm cắt ở chỗ ngắt hơi, không giữa từ; cụm quá ngắn (<500ms)
   không tạo cụm rác.
4. **MAX_SEG:** nói liền một mạch >6s không nghỉ → vẫn bị cắt cưỡng bức.
5. **Thả nút:** cụm cuối (phần đang nói dở) được gửi và đọc.
6. **ttsOn off:** vẫn hiện chữ theo cụm, không kẹt, không tiếng.
7. `npm run typecheck` sạch.

## Không nằm trong phạm vi

- Native VAD thật (native cắt theo giờ).
- Auto-gain / hiệu chỉnh `SPEECH_RMS` tự động.
- Thay đổi backend, giao thức WS, hay `audio.partial` path (giữ cho `/app` &
  tools).
- Đồng bộ mức từ trong cụm (đã có pace theo độ dài clip từ spec caption-reveal).
