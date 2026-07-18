# Sentence-Buffered TTS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gom transcript nguồn qua các cụm VAD; khi đủ một câu (dấu câu) hoặc khi thả nút mới dịch **cả câu** và TTS → audio phát theo câu cho mượt.

**Architecture:** Backend là nơi chính. `_on_audio_chunk` đệm text nguồn vào `SessionState._nmt_buffer`, dùng `split_sentences` tách câu trọn, dịch + TTS **từng câu**, giữ phần dư cho cụm sau; flush phần dư khi `audio.chunk` có `final=true`. Frontend chỉ thêm cờ `final:true` ở `endTurn`. Caption đã bám câu-đang-đọc qua `audioCue` (không đổi).

**Tech Stack:** FastAPI + WebSocket (Python), Expo/RN + Zustand + TypeScript strict.

## Global Constraints

- **Zero retention:** `_nmt_buffer` là RAM-only, reset ở `start()` + `cleanup()` (CLAUDE.md invariant).
- **Handler chỉ nói chuyện với base provider** — không import concrete provider (đã thoả: chỉ gọi `session.providers.nmt/tts`).
- **Backend không có pytest suite** — test `split_sentences` (thuần hàm) bằng `python -c`. Frontend gate `npm run typecheck`.
- **Tương thích ngược:** `final` là optional (mặc định false); `/app` console & client cũ không gửi → hành vi cũ trên phần đã có dấu câu.
- **Không `any`** ở frontend; **không đụng** giao thức khác, mặc định `ttsOn`, luồng caption/audioCue.
- Backend chạy từ `backend/` (venv). Frontend từ `frontend/`.

---

### Task 1: `core/text_utils.py` — tách câu

**Files:**
- Create: `backend/app/core/text_utils.py`

**Interfaces:**
- Consumes: —
- Produces: `split_sentences(text: str) -> tuple[list[str], str]` — `(câu_trọn, phần_dư)`. Câu kết bằng `. ! ? …` (kèm dấu đóng nháy/ngoặc). Bỏ "câu" chỉ toàn dấu. `phần_dư` đã strip.

- [ ] **Step 1: Viết file**

Tạo `backend/app/core/text_utils.py`:

```python
"""Sentence splitting for buffered TTS (translate/speak whole sentences).

Pure helper: accumulate STT source text across VAD segments, then pull out
COMPLETE sentences so NMT+TTS run on full sentences (smoother voice) while an
unfinished trailing clause stays buffered for the next segment.
"""
from __future__ import annotations

import re

# Mỗi câu: mọi ký tự tới cụm dấu kết câu (. ! ? …) + dấu đóng nháy/ngoặc theo sau.
_SENTENCE = re.compile(r"[^.!?…]*[.!?…]+[\"'”’)\]]*")


def split_sentences(text: str) -> tuple[list[str], str]:
    """Split `text` into (complete_sentences, remainder).

    A complete sentence ends at ./!/?/… (optionally trailing closing quotes or
    brackets). `remainder` is whatever trails the last terminator (unfinished).
    Sentences with no alphanumeric char (pure punctuation) are dropped.
    """
    sentences: list[str] = []
    end = 0
    for m in _SENTENCE.finditer(text):
        s = m.group().strip()
        if any(ch.isalnum() for ch in s):
            sentences.append(s)
        end = m.end()
    remainder = text[end:].strip()
    return sentences, remainder
```

- [ ] **Step 2: Viết test thất bại (chạy trước khi có logic đúng)**

> Backend không có pytest — dùng script `python -c`. Chạy TỪ `backend/`:

Run:
```bash
python -c "from app.core.text_utils import split_sentences as f; print(f('Xin chào. Tôi tên là Nam'))"
```
Expected sau khi hoàn thiện Step 1: `(['Xin chào.'], 'Tôi tên là Nam')`

- [ ] **Step 3: Chạy đủ các ca kiểm thử**

Run (từ `backend/`, đặt `PYTHONIOENCODING=utf-8` để in tiếng Việt trên Windows):
```bash
PYTHONIOENCODING=utf-8 python -c "
from app.core.text_utils import split_sentences as f
assert f('Xin chào. Tôi tên là Nam') == (['Xin chào.'], 'Tôi tên là Nam'), f('Xin chào. Tôi tên là Nam')
assert f('Hello world!') == (['Hello world!'], ''), f('Hello world!')
assert f('chưa xong') == ([], 'chưa xong'), f('chưa xong')
assert f('A? B! C.') == (['A?', 'B!', 'C.'], ''), f('A? B! C.')
assert f('...') == ([], ''), f('...')
assert f('') == ([], ''), 'empty'
print('OK')
"
```
Expected: in `OK` (mọi assert pass).

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/text_utils.py
git commit -m "feat(core): split_sentences — pull complete sentences from a buffer"
```

---

### Task 2: `SessionState._nmt_buffer` — đệm nguồn

**Files:**
- Modify: `backend/app/core/session.py`

**Interfaces:**
- Consumes: —
- Produces: `SessionState._nmt_buffer: str` — text nguồn tích luỹ chờ đủ câu; reset ở `start()` và `cleanup()`.

- [ ] **Step 1: Thêm field**

Trong `backend/app/core/session.py`, sau hai buffer hiện có (session.py:39-40) thêm:

```python
    # Nguồn tích luỹ chờ đủ một câu → dịch + TTS cả câu (buffered TTS).
    _nmt_buffer: str = field(default="", repr=False)
```

- [ ] **Step 2: Reset trong `start()`**

Trong `start()`, sau `self.started = True` (session.py:48) thêm:

```python
        self._nmt_buffer = ""
```

- [ ] **Step 3: Reset trong `cleanup()`**

Trong `cleanup()`, sau `self._text_buffer.clear()` (session.py:73) thêm:

```python
        self._nmt_buffer = ""
```

- [ ] **Step 4: Kiểm tra import được (không lỗi cú pháp)**

Run (từ `backend/`):
```bash
python -c "from app.core.session import SessionState; s=SessionState(); print(repr(s._nmt_buffer))"
```
Expected: in `''`

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/session.py
git commit -m "feat(session): _nmt_buffer holds source text until a full sentence"
```

---

### Task 3: `_on_audio_chunk` — buffer + dịch/đọc theo câu

**Files:**
- Modify: `backend/app/ws/handler.py`

**Interfaces:**
- Consumes: `split_sentences` (Task 1); `session._nmt_buffer` (Task 2); `data.get("final")`.
- Produces: mỗi câu trọn → `nmt.result`/`nmt.self` (peer/self) + `tts.audio` (peer). Không đủ câu → chỉ `metrics`.

- [ ] **Step 1: Import `split_sentences`**

Trong `backend/app/ws/handler.py`, cạnh các import `..core.*` (handler.py:21-23) thêm:

```python
from ..core.text_utils import split_sentences
```

- [ ] **Step 2: Thay khối NMT + TTS + Metrics**

Thay nguyên khối từ `# ---- NMT ...` tới hết `await send(ws, "metrics", metrics.as_event())` (handler.py:418-445) bằng:

```python
    # ---- Buffer nguồn tới đủ CÂU, rồi dịch + TTS cả câu (voice mượt) ------
    session._nmt_buffer = (session._nmt_buffer + " " + final_text).strip()
    sentences, remainder = split_sentences(session._nmt_buffer)
    if bool(data.get("final")) and remainder:
        # Thả nút: đọc nốt câu dở cuối dù chưa có dấu kết câu.
        sentences.append(remainder)
        remainder = ""
    session._nmt_buffer = remainder

    if not sentences:
        # Chưa đủ một câu → chờ cụm sau (độ trễ "chậm hơn"). Chỉ báo metrics STT.
        metrics.finish()
        await send(ws, "metrics", metrics.as_event())
        return

    nmt_ms = 0.0
    for sentence in sentences:
        # ---- NMT (cả câu) ------------------------------------------------
        try:
            with Stopwatch() as sw_nmt:
                dst_text = await session.providers.nmt.translate(
                    sentence, session.source_lang, session.target_lang
                )
            dst_text = apply_glossary(dst_text, session.glossary_id)
            nmt_ms += sw_nmt.ms
            # Translation goes to the listener (peer) in a room; self on console.
            await _emit_translation(ws, session, manager, speaker, sentence, dst_text)
        except Exception as exc:  # noqa: BLE001
            await send_error(ws, "nmt_failed", f"NMT provider failed: {exc}")
            continue

        # ---- TTS (optional) — audio từng câu, phát cuốn chiếu ------------
        if session.tts_on:
            try:
                audio_b64 = await session.providers.tts.synthesize(
                    dst_text, session.target_lang
                )
                await _emit(ws, session, manager, "tts.audio", {
                    "speaker": speaker, "audio": audio_b64,
                }, to_peer=True)
            except Exception as exc:  # noqa: BLE001 - TTS failure must not kill the turn
                await send_error(ws, "tts_failed", f"TTS provider failed: {exc}")

    metrics.nmt_ms = nmt_ms
    # ---- Metrics ---------------------------------------------------------
    metrics.finish()
    await send(ws, "metrics", metrics.as_event())
```

> Giữ nguyên phần STT phía trên (bao gồm `if not final_text or not final_text.strip(): return` — silence guard). NMT lỗi ở một câu dùng `continue` (bỏ câu đó, chạy câu kế) thay vì `return`.

- [ ] **Step 3: Kiểm tra import + cú pháp**

Run (từ `backend/`):
```bash
python -c "import app.ws.handler; print('import ok')"
```
Expected: in `import ok`

- [ ] **Step 4: Kiểm chứng buffer end-to-end (in-process TestClient, self-loop)**

> CLAUDE.md: TestClient dùng được cho pipeline single-connection (self-loop). Mode `mock` để không cần key; mock TTS off mặc định nên chỉ kiểm `nmt.result` theo câu.

Run (từ `backend/`):
```bash
PYTHONIOENCODING=utf-8 python -c "
from fastapi.testclient import TestClient
from app.main import app
import base64
wav = base64.b64encode(b'\x00'*64).decode()  # mock STT bỏ qua nội dung
with TestClient(app) as c:
    with c.websocket_connect('/ws') as ws:
        ws.send_json({'type':'session.start','data':{'mode':'mock','sourceLang':'en','targetLang':'vi'}})
        # mock STT trả text cố định; gửi 2 chunk, chunk 2 final
        ws.send_json({'type':'audio.chunk','data':{'speaker':'me','audio':wav}})
        ws.send_json({'type':'audio.chunk','data':{'speaker':'me','audio':wav,'final':True}})
        got = []
        import json
        for _ in range(20):
            try:
                m = ws.receive_json()
            except Exception:
                break
            got.append(m['type'])
            if m['type']=='metrics' and 'final' in str(got): pass
        print('events:', got)
"
```
Expected: thấy có `stt.final`, và ít nhất một `nmt.result` (mock STT có dấu câu → tách câu chạy). Không lỗi/không treo. (Chỉ cần xác nhận pipeline chạy + có `nmt.result`; nội dung phụ thuộc mock.)

- [ ] **Step 5: Commit**

```bash
git add backend/app/ws/handler.py
git commit -m "feat(ws): buffer source, translate + TTS whole sentences per turn"
```

---

### Task 4: Frontend — `endTurn` gửi `final: true`

**Files:**
- Modify: `frontend/src/types/translator.ts`
- Modify: `frontend/src/store/slices/translatorSlice.ts`

**Interfaces:**
- Consumes: —
- Produces: `audio.chunk` từ `endTurn` mang `final: true`; type `AudioChunkMessage.data` có `final?: boolean`.

- [ ] **Step 1: Thêm `final?` vào type**

Trong `frontend/src/types/translator.ts`, đổi `AudioChunkMessage` (translator.ts:80-84):

```ts
export interface AudioChunkMessage {
  type: 'audio.chunk';
  /** `audio` là WAV 16kHz mono base64. `final` = true khi thả nút (kết thúc lượt)
   *  → backend flush nốt câu dở cuối. commitSegment KHÔNG gửi final. */
  data: { speaker: Speaker; audio: string; final?: boolean };
}
```

- [ ] **Step 2: `endTurn` gửi `final: true`**

Trong `frontend/src/store/slices/translatorSlice.ts`, đổi dòng gửi trong `endTurn` (translatorSlice.ts:550):

```ts
      _socket.send({ type: 'audio.chunk', data: { speaker, audio: wavBase64, final: true } });
```

> `commitSegment` (translatorSlice.ts:539) GIỮ NGUYÊN (không `final`).

- [ ] **Step 3: Gate — typecheck**

Run (từ `frontend/`):
```bash
npm run typecheck
```
Expected: zero error.

- [ ] **Step 4: Kiểm chứng runtime (2 tab web)**

Chạy backend (`edge` TTS mặc định để có audio; `cloud` có key để dịch thật) + `npm run web`; 2 tab localhost, ghép phòng. Trên máy NGHE:

1. **Đọc theo câu:** người nói nói câu dài có ngắt hơi giữa chừng → audio KHÔNG phát theo từng mảnh cụm; chờ tới khi đủ câu (dấu chấm) mới đọc cả câu, mượt.
2. **Flush khi thả nút:** nói một câu dở (không kết bằng dấu chấm) rồi thả nút → câu dở đó vẫn được dịch + đọc.
3. **Caption bám câu:** hero hiện câu đang đọc, khớp giọng (audioCue theo câu).
4. **ttsOn off:** vẫn hiện bản dịch theo câu, không tiếng, không kẹt.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/translator.ts frontend/src/store/slices/translatorSlice.ts
git commit -m "feat(client): endTurn flags audio.chunk final so backend flushes last sentence"
```

---

## Self-Review

**Spec coverage:**
- §1 `text_utils.split_sentences` → Task 1. ✅
- §2 `SessionState._nmt_buffer` + reset start/cleanup → Task 2. ✅
- §3 `_on_audio_chunk` buffer + per-sentence NMT/TTS + `not sentences` → metrics → Task 3 Step 2. ✅
- §4 đọc `final` → Task 3 Step 2 (`data.get("final")`). ✅
- §5 frontend `endTurn` final + type → Task 4. ✅
- §Luồng dữ liệu → Task 3 (buffer/flush) + Task 4 (final). ✅
- §Xử lý lỗi & biên: silence guard giữ nguyên (Task 3 note), chưa đủ câu → metrics-only (Task 3), NMT/TTS lỗi từng câu → continue/try riêng (Task 3), final không tới → cleanup wipe (Task 2), /app không final (Task 3 tương thích ngược). ✅
- §Kiểm thử → Task 1 Step 3 (unit), Task 3 Step 4 (pipeline), Task 4 Step 4 (runtime). ✅

**Placeholder scan:** không TBD/TODO; mọi step có code/lệnh cụ thể. ✅

**Type consistency:** `split_sentences(text)->tuple[list[str],str]` khớp Task 1 (khai) và Task 3 (dùng `sentences, remainder =`); `_nmt_buffer: str` khớp Task 2 (khai) và Task 3 (đọc/ghi); `final?: boolean` khớp Task 4 type và `endTurn` gửi; `data.get("final")` (backend) ↔ `final: true` (client). ✅
