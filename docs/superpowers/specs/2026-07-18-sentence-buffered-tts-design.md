# TTS theo câu (gom nguồn tới hết câu rồi dịch)

**Ngày:** 2026-07-18
**Phạm vi:** `backend/` (`core/text_utils.py` mới, `core/session.py`,
`ws/handler.py`) + `frontend/` (`store/slices/translatorSlice.ts`).

## Vấn đề

Sau khi chuyển sang cắt cụm VAD ([[rolling-segment-vad-mic]]), mỗi cụm (cắt theo
ngắt hơi ~650ms) được dịch + TTS ngay như một `audio.chunk` độc lập. Cụm thường
là **mảnh câu**, nên edge-tts đọc mảnh cụt → nghe vấp, thiếu ngữ điệu câu.

Người dùng muốn TTS theo **câu trọn** cho mượt, chấp nhận chậm hơn.

## Mục tiêu

Gom transcript nguồn qua các cụm; khi đủ một câu (dấu câu) hoặc khi thả nút, mới
dịch **cả câu** và TTS. Audio phát theo câu → mượt. Caption bám câu đang đọc.

## Quyết định thiết kế (đã chốt với người dùng)

1. **Gom NGUỒN tới hết câu → dịch cả câu → đọc.** Dịch cả câu cho chất lượng dịch
   + ngữ điệu tốt nhất. Chậm nhất (chờ đủ câu) — chấp nhận.
2. **Caption bám câu đang đọc**, khớp giọng — tái dùng cơ chế `audioCue` /
   hero-follows-playing đã có ([[audio-synced-caption-reveal]]).

## Caveat đã thống nhất

Whisper (`whisper-large-v3`) thường **tự thêm dấu chấm cuối mỗi cụm** nó phiên âm.
Nếu cụm nào cũng bị chấm câu, việc gộp nguồn ít gộp được (mỗi cụm thành 1 "câu") →
kết quả **bằng** hiện tại (không tệ hơn). Lợi rõ khi cụm bị cắt giữa câu (không có
dấu chấm) → gộp với cụm sau thành câu đầy đủ. Ghi chú trong code; hướng tinh chỉnh
tương lai: dùng độ dài khoảng lặng (client) để phân biệt ngắt-câu vs ngắt-hơi.

## Kiến trúc & thành phần

Backend là nơi chính (nó nắm STT + NMT + TTS); frontend chỉ thêm cờ `final`.

### 1. `backend/app/core/text_utils.py` (mới) — tách câu

- `split_sentences(text: str) -> tuple[list[str], str]`:
  - Trả `(sentences, remainder)`. `sentences`: danh sách câu trọn (kết bằng
    `. ! ? …`, kèm dấu đóng ngoặc/nháy nếu có). `remainder`: phần đuôi chưa kết
    câu (đã strip).
  - Bỏ "câu" chỉ toàn dấu (không có ký tự chữ/số).
  - Thuần hàm, không side-effect, không I/O.
  - Regex: mỗi câu = `[^.!?…]*[.!?…]+["'”’\)\]]*`. `remainder` = phần sau match
    cuối cùng.
  - Caveat: "3.5", "Mr." có thể bị tách nhầm — hiếm trong lời nói, chấp nhận.

### 2. `backend/app/core/session.py` — đệm nguồn

- Thêm field: `_nmt_buffer: str = ""` (transient, RAM-only, giống các buffer
  khác). `field(default="", repr=False)`.
- `start()` reset `self._nmt_buffer = ""`.
- `cleanup()` reset `self._nmt_buffer = ""` (zero-retention).

### 3. `backend/app/ws/handler.py` — `_on_audio_chunk` buffer + tách câu

Thay đoạn NMT+TTS (sau khi STT ra `final_text`, đoạn hiện tại dòng ~413–445):

- Sau khối STT: nếu `final_text` rỗng → giữ nguyên (silence guard, return sớm).
- `session._nmt_buffer = (session._nmt_buffer + " " + final_text).strip()`.
- `is_final = bool(data.get("final"))`.
- `sentences, remainder = split_sentences(session._nmt_buffer)`.
- `if is_final and remainder: sentences.append(remainder); remainder = ""`.
- `session._nmt_buffer = remainder`.
- Nếu `sentences` rỗng → chưa đủ câu: chỉ emit `metrics` (stt-only) rồi return
  (chưa dịch/đọc — đây là độ trễ "chậm hơn").
- Với **mỗi** `sentence` trong `sentences` (theo thứ tự):
  - NMT: `dst = apply_glossary(await nmt.translate(sentence, src, tgt), glossary_id)`
    (cộng dồn `nmt_ms`).
  - `await _emit_translation(ws, session, manager, speaker, sentence, dst)`.
  - `if session.tts_on:` synthesize `dst` → `_emit(... "tts.audio" ..., to_peer=True)`
    (bọc try/except: lỗi TTS không giết turn — giữ như hiện tại).
- `metrics.finish(); await send(ws, "metrics", metrics.as_event())`.
- Mỗi stage bọc try/except như bản hiện tại (NMT lỗi → `error nmt_failed`; TTS lỗi
  → `error tts_failed`, không abort).

### 4. `backend/app/ws/handler.py` — đọc `final`

`audio.chunk` data nhận thêm khoá tùy chọn `final: bool` (mặc định false). Đọc
qua `data.get("final")`. Tương thích ngược: client cũ / `/app` không gửi → false.

### 5. `frontend/app` — `endTurn` gửi `final: true`

- `store/slices/translatorSlice.ts` `endTurn`: gửi
  `{ type: 'audio.chunk', data: { speaker, audio: wavBase64, final: true } }`.
- `commitSegment` giữ nguyên (không `final`).
- **Caption không đổi** — hero bám cụm-đang-phát qua `audioCue` (đã xây); giờ
  nmt.result + tts.audio theo câu ⇒ hero tự thành câu-đang-đọc.

## Luồng dữ liệu (người nghe)

```
người nói nói liên tục
  VAD cắt cụm 1 → audio.chunk{final:false}
    STT cụm 1 → buffer += "Xin chào tôi"      (chưa dấu câu → chưa đọc)
  VAD cắt cụm 2 → audio.chunk{final:false}
    STT cụm 2 → buffer = "Xin chào tôi tên là Nam."  → 1 câu trọn
      NMT("Xin chào tôi tên là Nam.") → nmt.result + tts.audio (peer)
    audio câu phát (hàng đợi) → audioCue → hero = câu đó, gõ khớp
  ...
người nói thả nút → audio.chunk{final:true}
    STT cụm cuối → buffer → flush remainder thành câu cuối → dịch + đọc
```

## Xử lý lỗi & biên

- **Cụm im lặng:** STT trả rỗng → return sớm (không đụng buffer). Giữ như hiện tại.
- **Chưa đủ câu:** buffer giữ text, không emit nmt/tts; emit metrics stt-only.
- **`final` không tới** (disconnect giữa chừng): remainder kẹt trong buffer → bị
  wipe ở `cleanup()`. Không đọc phần dở đó — chấp nhận (mất kết nối).
- **Turn mới sau khi đã flush:** buffer rỗng (đã thành remainder="" ở final) →
  sạch. Nếu turn trước kết thúc bất thường (không final), buffer cũ có thể dính
  vào turn sau — hiếm, chấp nhận.
- **`/app` console:** không gửi `final` → mảnh dở cuối chờ cụm sau (thường Whisper
  đã chấm câu). Ghi chú, không sửa console.
- **NMT/TTS lỗi giữa danh sách câu:** câu lỗi emit `error`, các câu khác vẫn chạy
  (mỗi câu bọc try/except riêng như bản hiện tại cho từng stage).

## Kiểm thử

- **Unit (thuần hàm)** `split_sentences` — chạy được không cần server:
  - `"Xin chào. Tôi tên là Nam"` → `(["Xin chào."], "Tôi tên là Nam")`.
  - `"Hello world!"` → `(["Hello world!"], "")`.
  - `"chưa xong"` → `([], "chưa xong")`.
  - `"A? B! C."` → `(["A?", "B!", "C."], "")`.
  - `"..."` (chỉ dấu) → `([], "")` (không có ký tự chữ/số).
- **Runtime** (2 tab web, TTS bật): audio phát theo CÂU (không theo mảnh cụm);
  nói cụm dở rồi ngắt hơi ngắn → chờ, khi đủ câu mới đọc; thả nút → câu cuối được
  đọc; caption hero bám câu đang đọc.
- `npm run typecheck` (frontend) sạch. Backend không có pytest suite; test
  `split_sentences` bằng `python -c` (xem plan).

## Không nằm trong phạm vi

- Phân biệt ngắt-câu vs ngắt-hơi bằng độ dài khoảng lặng (tinh chỉnh tương lai).
- Gộp lịch sử per-cụm của speaker thành câu (speaker vẫn thấy stt.final per cụm).
- Đổi giao thức khác, mặc định `ttsOn`, backend provider nào.
- Xử lý dấu câu tiếng Việt đặc thù / viết tắt / số thập phân.
