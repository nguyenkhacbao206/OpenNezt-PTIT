# Spec: Phụ đề YouTube + dịch theo cụm (dual-mode, hybrid Cloud/Offline)

Ngày: 2026-07-17
Trạng thái: Chờ review

## 1. Context / Vấn đề

Trang `/translator` hiện gửi cửa sổ audio ~1.2s về Groq Whisper để vừa STT vừa dịch:
phụ đề gốc **khựng theo cụm, trễ ~1s, nhảy chữ**; và bản dịch chạy word-by-word thô.

Người dùng muốn:
1. **Phụ đề gốc kiểu YouTube** — chữ chạy word-by-word, trễ ~0, khi đang nói.
2. **Bản dịch theo cụm có nghĩa** (KHÔNG word-by-word), phát ra khi có "cụm ổn định",
   dịch dần cho câu dài và chờ trọn câu cho câu ngắn.
3. Giữ **on-premise/bảo mật** ở chế độ Offline.

## 2. Goals / Non-goals

**Goals**
- Cloud: phụ đề gốc YouTube-style qua **Web Speech API**; dịch theo **dual-mode** (dưới).
- Offline: **giữ nguyên** Whisper windowed (STT local, zero-retention).
- Một giao diện **chạy cả hai luồng**, chuyển bằng nút Cloud ⇄ Offline.

**Non-goals**
- Không đổi pipeline Offline; không thêm STT vendor thứ ba; không làm TTS.

## 3. Ảnh hưởng SRS (đã cân nhắc)

Web Speech API (Chrome/Edge) **gửi audio lên Google** → không on-device. Vì vậy **chỉ dùng
cho Cloud mode** (đã là hybrid-cloud). **Offline giữ Whisper local** để không phá cam kết
zero-retention (SRS §2.2.1, §4.2). "Nguồn phụ đề" là provider hoán đổi theo mode.

## 4. Chiến lược dịch (dual-mode theo ngưỡng) — TRỌNG TÂM

**Ngưỡng chuyển mode:** `2.5 giây` **HOẶC** `12 token` (đếm xấp xỉ bằng số từ ở client).

- **Câu ngắn — CHƯA vượt ngưỡng → Sentence Mode:** chờ Web Speech trả đoạn `isFinal`
  (câu hoàn chỉnh) rồi dịch **cả câu** một lần.
- **Câu dài — VƯỢT ngưỡng khi vẫn đang nói → Streaming Mode:** cắt phần đã ổn định thành
  **"stable phrase"**, dịch dần theo cụm.

**Quy tắc (từ goal):**
- Phát bản dịch khi phát hiện **cụm ổn định** (stable phrase), **không dịch từng chữ**.
- Dịch theo **cụm có nghĩa**.
- **Chỉ sửa segment cuối chưa chốt**; các segment đã confirm **giữ nguyên**.
- **Bảo toàn** tên riêng, số, ngày tháng, tên công ty, thuật ngữ kỹ thuật.
- Ưu tiên **độ trễ thấp + chính xác mức business**.

**"Stable phrase" =** interim của Web Speech không đổi trong ~300–400ms (debounce) hoặc
gặp ranh giới cụm/câu; hoặc khi chạm ngưỡng 2.5s/12-token.

> Phân biệt rõ: **phụ đề GỐC** vẫn hiển thị word-by-word (YouTube). Quy tắc "không
> word-by-word" chỉ áp cho **bản DỊCH**.

### 4.1 Ánh xạ vào state hiện có (tái dùng)
- **Segment đã chốt** (cả gốc + dịch) → sự kiện `nmt.result` → **append vào `turns`**
  (dòng khoá, không đổi nữa).
- **Đuôi chưa chốt** → gốc hiện ở `liveOriginal` (caption), dịch ở `liveTranslation`
  (được revise).
- **Tránh trùng lặp:** caption gốc live (`liveOriginal`) **chỉ hiện phần đuôi CHƯA chốt** —
  khi một cụm được chốt thành `turn`, nó biến mất khỏi caption và thành dòng khoá. Segmenter
  giữ mốc offset đã-chốt và chỉ đẩy phần sau mốc vào caption + `text.partial`.
- Câu dài Streaming Mode → nhiều `turns` chốt dần trong một lượt nói; câu ngắn Sentence
  Mode → một `turn`.

## 5. Kiến trúc

### 5.1 Nguồn phụ đề theo mode
| Mode | STT (phụ đề gốc) | NMT (dịch) |
|------|------------------|------------|
| Cloud + Web Speech hỗ trợ | Browser Web Speech API (client) | Groq (backend, đường TEXT) |
| Offline / không hỗ trợ | Whisper windowed (backend, đường AUDIO) | provider offline/mock |

Cloud mode: backend **không STT** — chỉ dịch TEXT → rẻ hơn (không tốn call STT).

### 5.2 Giao thức WebSocket
**Thêm đường TEXT (Cloud)** — dùng chiều dịch của session (đặt qua `session.start`):
- C→S `text.partial {speaker, text}` → S→C `nmt.partial {speaker, srcText, dstText, isFinal:false}`
  (dịch phần đuôi chưa chốt).
- C→S `text.final {speaker, text}` → S→C `nmt.result {speaker, srcText, dstText}`
  (chốt một segment/câu).

**Giữ đường AUDIO (Offline)** — không đổi: `audio.partial`→`stt.partial`+`nmt.partial`;
`audio.chunk`→`stt.final`+`nmt.result`.

### 5.3 Backend (`app/ws/handler.py`, `app/providers/groq_client.py`)
- `_on_text_partial`: `session.providers.nmt.translate_partial(text, …)` (best-effort) → `nmt.partial`.
- `_on_text_final`: `session.providers.nmt.translate(text, …)` → `nmt.result`.
- Route thêm `text.partial`/`text.final`. Cần `session.start` trước (có `providers` + chiều
  dịch). Không STT. Zero-retention giữ nguyên.
- **Cập nhật prompt dịch** (cả `build_translate_messages` và `build_partial_translate_messages`):
  "Translate by **meaningful phrases, not word-by-word**. **Preserve names, numbers, dates,
  company names, and technical terms exactly.** Keep it business-accurate and concise."

### 5.4 Frontend
- **Hook `useSpeechRecognition(lang, { onInterim, onFinal })`** (mới): feature-detect
  `SpeechRecognition || webkitSpeechRecognition`; `continuous`, `interimResults`, `lang`
  = `vi-VN`/`en-US`. `onresult` tách interim/final; `onend` → restart nếu còn nghe;
  `onerror` → báo lỗi. Trả `{ supported, listening, start, stop, error }`.
- **Segmenter (client)** — logic dual-mode ở page/hook riêng `useTranslationSegmenter`:
  - Giữ buffer text chưa emit + mốc thời gian lần emit gần nhất + số từ chưa emit.
  - Mỗi interim: nếu có final (câu xong) → `sendTextFinal(segment)`, reset. Ngược lại nếu
    `(elapsed ≥ 2.5s HOẶC words ≥ 12)` và phrase ổn định → chốt stable phrase bằng
    `sendTextFinal(phrase)` (append confirmed) và bắt đầu buffer mới; đồng thời đuôi đang
    lớn dần → `sendTextPartial(tail)` (debounce ~600ms). Ngược lại → chờ (Sentence Mode).
- **Slice (`translatorSlice.ts`):** thêm `sendTextPartial`/`sendTextFinal` (đường text,
  dùng `ensureDirection`); `setCaption(speaker, text|null)` set `liveOriginal` **cục bộ**
  (caption từ Web Speech). Giữ `sendPartial`/`sendTurn` (audio offline) + xử lý sự kiện
  `stt.partial`/`nmt.partial`/`nmt.result` như hiện tại.
- **Page:** rẽ nhánh theo `(mode, speechSupported)`:
  - Cloud + hỗ trợ → `useSpeechRecognition` + segmenter: interim → `setCaption` + segmenter;
    final → segmenter chốt.
  - Offline / không hỗ trợ → `useMic` windowed (hiện tại).
- **Hiển thị:** panel người nói = phụ đề GỐC word-by-word (`useWordReveal` trên
  `liveOriginal`); panel bên kia = bản dịch theo cụm (`turns` đã chốt giữ nguyên +
  `liveTranslation` là cụm cuối đang revise).

## 6. Xử lý biên
- Web Speech `onend` khi im lặng → restart nếu còn nghe.
- Không hỗ trợ (Safari/Firefox) → **tự fallback** Whisper windowed + chú thích.
- Không quyền mic / mất mạng → báo lỗi + fallback.
- Debounce/ngưỡng để chặn spam Groq (tránh 429).
- `12 token` xấp xỉ bằng **số từ** (client không có tokenizer) — nêu rõ là ước lượng.
- Chất lượng nhận dạng tiếng Việt Web Speech: khá, đủ demo.

## 7. Verify / Test
1. **Backend (không cần audio):** in-process `session.start(cloud,vi,en)` +
   `text.partial{vn,"Xin chào mọi người"}` → `nmt.partial`; `text.final` → `nmt.result`.
   Kiểm tra bảo toàn số/tên (vd "Công ty ABC ký 3 hợp đồng ngày 5 tháng 1").
2. **Type + lint FE:** `tsc --noEmit` (config tạm `include ["src"]`) exit 0; `eslint` file
   đã đổi exit 0.
3. **Trình duyệt (Chrome):**
   - Câu ngắn → dịch một lần khi dứt câu (Sentence Mode).
   - Câu dài (>2.5s hoặc >12 từ) → dịch dần theo cụm, cụm đã chốt không đổi (Streaming Mode).
   - Phụ đề gốc chạy word-by-word; bản dịch theo cụm.
   - Chuyển Offline → chạy Whisper windowed. Firefox → fallback không vỡ.

## 8. File dự kiến đụng
- Backend: `app/ws/handler.py` (2 handler + route), `app/providers/groq_client.py` (prompt).
- Frontend: `components/hooks/useSpeechRecognition.ts` + `useTranslationSegmenter.ts` (mới) +
  `hooks/index.ts`; `store/slices/translatorSlice.ts`; `pages/Translator/index.tsx`;
  `types/translator.ts` (`text.partial`/`text.final`).
