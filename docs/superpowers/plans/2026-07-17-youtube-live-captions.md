# YouTube Live Captions + Dual-Mode Translation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phụ đề gốc kiểu YouTube (Web Speech, Cloud mode) + bản dịch theo cụm có nghĩa với dual-mode (Sentence/Streaming) theo ngưỡng 2.5s / 12 từ; Offline giữ Whisper windowed.

**Architecture:** Ở Cloud mode, STT chạy trong trình duyệt (Web Speech API) cho phụ đề gốc; một "segmenter" phía client quyết định khi nào gửi TEXT về backend để dịch (theo cụm/ngưỡng). Backend thêm đường TEXT (`text.partial`/`text.final`) chỉ dịch, không STT. Offline mode giữ nguyên đường AUDIO (Whisper). Nguồn phụ đề là provider hoán đổi theo mode.

**Tech Stack:** FastAPI + WebSocket (Python) · Groq OpenAI-compatible API · React 18 + TypeScript strict + Zustand · Web Speech API (browser).

## Global Constraints

- **Không có test runner trong repo** (backend: không pytest — CLAUDE.md; frontend: không vitest). Verify bằng: python assert one-liner cho hàm thuần; in-process `fastapi.testclient.TestClient` WebSocket cho backend; `tsc --noEmit` (config tạm chỉ `include ["src"]`) + `eslint --max-warnings 0` + kịch bản trình duyệt cho frontend. **Không thêm framework test mới.**
- **Backend provider pattern:** handler chỉ gọi base class; không import provider cụ thể vào handler; chọn provider ở `factory.py`. (CLAUDE.md)
- **Zero-retention:** không ghi audio/text ra đĩa; buffer chỉ trong RAM.
- **Frontend (frontend/CLAUDE.md):** TypeScript strict, **cấm `any`** (dùng `unknown` + narrow); `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` đang bật; import qua alias `@/…`; component/hook/service đặt đúng tầng; mỗi thư mục có barrel `index.ts`.
- **Web Speech chỉ ở Cloud mode** (audio rời máy → không dùng cho Offline). Offline giữ Whisper local.
- **`tsc -b` gốc hỏng sẵn** (references thiếu `composite`); dùng config tạm `tsconfig.check.json` (`extends ./tsconfig.json`, `include ["src"]`, `references []`) để type-check.
- Prompt dịch phải: dịch theo **cụm có nghĩa** (không word-by-word); **bảo toàn** tên riêng, số, ngày tháng, tên công ty, thuật ngữ kỹ thuật.

---

## File Structure

- `backend/app/providers/groq_client.py` — cập nhật 2 hàm build prompt (entity-preserving, phrase-based).
- `backend/app/ws/handler.py` — thêm route + `_on_text_partial` / `_on_text_final`.
- `frontend/src/types/translator.ts` — thêm `TextPartialMessage` / `TextFinalMessage` vào `ClientMessage`.
- `frontend/src/store/slices/translatorSlice.ts` — thêm `sendTextPartial`, `sendTextFinal`, `setCaption`.
- `frontend/src/components/hooks/useSpeechRecognition.ts` — MỚI: bọc Web Speech API.
- `frontend/src/components/hooks/segmenter.ts` — MỚI: hàm thuần `decideSegment` (logic dual-mode).
- `frontend/src/components/hooks/useTranslationSegmenter.ts` — MỚI: hook bọc `decideSegment` + timers.
- `frontend/src/components/hooks/index.ts` — export hook/hàm mới.
- `frontend/src/pages/Translator/index.tsx` — rẽ nhánh nguồn phụ đề theo `(mode, speechSupported)`.

---

## Task 1: Backend — prompt dịch theo cụm + bảo toàn entity

**Files:**
- Modify: `backend/app/providers/groq_client.py` (`build_translate_messages`, `build_partial_translate_messages`)

**Interfaces:**
- Produces: `build_translate_messages(text, source_lang, target_lang) -> list[dict]` và `build_partial_translate_messages(...) -> list[dict]` (chữ ký giữ nguyên, chỉ đổi nội dung system prompt).

- [ ] **Step 1: Cập nhật `build_translate_messages`** — thay system prompt:

```python
def build_translate_messages(text: str, source_lang: str, target_lang: str) -> list[dict]:
    """Build OpenAI-style chat messages for translating text (both directions)."""
    src = language_name(source_lang)
    tgt = language_name(target_lang)
    system = (
        f"You are a professional {src}-to-{tgt} interpreter for business meetings. "
        "Translate by meaningful phrases, not word-by-word. Preserve names, numbers, "
        "dates, company names, and technical terms exactly as given. Keep it "
        "business-accurate, natural and concise. Return ONLY the translation — no "
        "commentary, quotes, or markdown."
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": text},
    ]
```

- [ ] **Step 2: Cập nhật `build_partial_translate_messages`** — thay system prompt:

```python
def build_partial_translate_messages(text: str, source_lang: str, target_lang: str) -> list[dict]:
    """Build chat messages for translating a partial (still-being-spoken) segment."""
    src = language_name(source_lang)
    tgt = language_name(target_lang)
    system = (
        f"You are a live {src}-to-{tgt} interpreter for a business meeting. The text "
        "is a segment that may be an unfinished phrase. Translate by meaningful "
        "phrases (NOT word-by-word) only what has actually been said — do not guess "
        "or complete the sentence. Preserve names, numbers, dates, company names, and "
        "technical terms exactly. Return ONLY the translation."
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": text},
    ]
```

- [ ] **Step 3: Verify hàm thuần build đúng cấu trúc** (không cần mạng):

Run:
```bash
cd backend && .venv/Scripts/python.exe -c "from app.providers import groq_client as g; m=g.build_translate_messages('x','vi','en'); assert m[0]['role']=='system' and 'meaningful phrases' in m[0]['content'] and 'Preserve names' in m[0]['content'] and m[1]['content']=='x'; p=g.build_partial_translate_messages('y','en','vi'); assert 'do not guess' in p[0]['content']; print('OK prompts')"
```
Expected: `OK prompts`

- [ ] **Step 4: Verify dịch thật bảo toàn số/tên** (cần key Groq):

Run:
```bash
cd backend && .venv/Scripts/python.exe -c "import asyncio; from app.core.config import settings as s; from app.providers import groq_client as g; print(asyncio.run(g.translate_text(s.groq_api_key,s.groq_api_url,s.groq_nmt_model,'Công ty ABC ký 3 hợp đồng ngày 5 tháng 1 năm 2026.','vi','en')))"
```
Expected: bản dịch tiếng Anh giữ nguyên `ABC`, `3`, `5`, `2026` (ví dụ: "Company ABC signed 3 contracts on January 5, 2026.").

- [ ] **Step 5: Commit**

```bash
git add backend/app/providers/groq_client.py
git commit -m "feat(nmt): phrase-based prompt preserving names/numbers/dates/terms"
```

---

## Task 2: Backend — đường TEXT (`text.partial` / `text.final`)

**Files:**
- Modify: `backend/app/ws/handler.py` (thêm route trong `dispatch`; thêm 2 hàm handler)

**Interfaces:**
- Consumes: `session.providers.nmt.translate(...)` và `.translate_partial(...)` (đã có); `send`, `send_error`, `apply_glossary`, `Stopwatch`, `TurnMetrics` (đã import sẵn trong file).
- Produces: xử lý client event `text.partial {speaker, text}` → server `nmt.partial {speaker, srcText, dstText, isFinal:false}`; `text.final {speaker, text}` → server `nmt.result {speaker, srcText, dstText}` + `metrics`.

- [ ] **Step 1: Thêm route trong `dispatch`** — sau nhánh `audio.partial`:

```python
    elif event == "audio.partial":
        await _on_audio_partial(ws, session, data)
    elif event == "text.partial":
        await _on_text_partial(ws, session, data)
    elif event == "text.final":
        await _on_text_final(ws, session, data)
    elif event == "config.update":
```

- [ ] **Step 2: Thêm 2 handler** — đặt ngay trước `async def _on_audio_chunk`:

```python
async def _on_text_partial(ws: WebSocket, session: SessionState, data: dict) -> None:
    """Translate an unfinished text segment from a browser-side STT (Cloud mode).

    Best-effort: failures are swallowed (no error event); the confirmed segment
    still arrives via text.final -> nmt.result.
    """
    if not session.started or session.providers is None:
        return
    speaker = data.get("speaker", "unknown")
    text = (data.get("text") or "").strip()
    if not text:
        return
    try:
        dst_text = await session.providers.nmt.translate_partial(
            text, session.source_lang, session.target_lang
        )
        dst_text = apply_glossary(dst_text, session.glossary_id)
        await send(ws, "nmt.partial", {
            "speaker": speaker, "srcText": text, "dstText": dst_text, "isFinal": False,
        })
    except Exception as exc:  # noqa: BLE001 - partials are best-effort
        log.info("text.partial skipped for speaker=%s: %s", speaker, exc)


async def _on_text_final(ws: WebSocket, session: SessionState, data: dict) -> None:
    """Translate a confirmed text segment (browser-side STT, Cloud mode)."""
    if not session.started or session.providers is None:
        await send_error(ws, "no_session", "session.start must be sent first.", can_fallback=False)
        return
    speaker = data.get("speaker", "unknown")
    text = (data.get("text") or "").strip()
    if not text:
        return
    metrics = TurnMetrics()
    try:
        with Stopwatch() as sw_nmt:
            dst_text = await session.providers.nmt.translate(
                text, session.source_lang, session.target_lang
            )
        dst_text = apply_glossary(dst_text, session.glossary_id)
        metrics.nmt_ms = sw_nmt.ms
        await send(ws, "nmt.result", {
            "speaker": speaker, "srcText": text, "dstText": dst_text,
        })
    except Exception as exc:  # noqa: BLE001
        await send_error(ws, "nmt_failed", f"NMT provider failed: {exc}")
        return
    metrics.finish()
    await send(ws, "metrics", metrics.as_event())
```

- [ ] **Step 3: Verify import + route không lỗi**

Run:
```bash
cd backend && .venv/Scripts/python.exe -c "from app.main import app; print('import OK')"
```
Expected: `import OK`

- [ ] **Step 4: Verify end-to-end đường TEXT (in-process, cần key Groq)** — tạo `backend/tools/_tmp_text_e2e.py`:

```python
import sys
sys.stdout.reconfigure(encoding="utf-8")
from fastapi.testclient import TestClient
from app.main import app
with TestClient(app).websocket_connect("/ws") as ws:
    ws.send_json({"type": "session.start", "data": {"mode": "cloud", "sourceLang": "vi", "targetLang": "en"}})
    ws.send_json({"type": "text.partial", "data": {"speaker": "vn", "text": "Xin chào mọi người"}})
    ws.send_json({"type": "text.final", "data": {"speaker": "vn", "text": "Xin chào mọi người, hôm nay ta chốt hợp đồng"}})
    order = []
    for _ in range(10):
        m = ws.receive_json(); t = m.get("type"); order.append(t)
        if t in ("nmt.partial", "nmt.result"):
            print(t, "->", m["data"].get("dstText"))
        if t == "nmt.result":
            break
    assert "nmt.partial" in order and "nmt.result" in order, order
    print("ORDER", order)
    ws.send_json({"type": "session.end", "data": {}})
```

Run:
```bash
cd backend && PYTHONPATH=. .venv/Scripts/python.exe tools/_tmp_text_e2e.py 2>&1 | grep -vE "INFO:|WARNING:|httpx:|Deprecation|from starlette"
```
Expected: in ra `nmt.partial -> Hello everyone`, `nmt.result -> Hello everyone, ...`, và `ORDER [...]` chứa cả hai. Sau đó xoá file:
```bash
rm -f backend/tools/_tmp_text_e2e.py
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/ws/handler.py
git commit -m "feat(ws): add text.partial/text.final translate path (browser STT)"
```

---

## Task 3: Frontend — types cho đường TEXT

**Files:**
- Modify: `frontend/src/types/translator.ts`

**Interfaces:**
- Produces: `TextPartialMessage` (`type:'text.partial'`, `data:{speaker,text}`), `TextFinalMessage` (`type:'text.final'`, `data:{speaker,text}`); cả hai thêm vào union `ClientMessage`. (`nmt.partial`/`nmt.result` đã có sẵn ở `ServerEvent`.)

- [ ] **Step 1: Thêm 2 interface** — sau `AudioPartialMessage`:

```typescript
export interface TextPartialMessage {
  type: 'text.partial';
  /** Đoạn text chưa chốt (từ Web Speech) để dịch xem trước. */
  data: { speaker: Speaker; text: string };
}

export interface TextFinalMessage {
  type: 'text.final';
  /** Đoạn text đã chốt (cụm ổn định / trọn câu) để dịch chính thức. */
  data: { speaker: Speaker; text: string };
}
```

- [ ] **Step 2: Thêm vào union `ClientMessage`:**

```typescript
export type ClientMessage =
  | SessionStartMessage
  | AudioChunkMessage
  | AudioPartialMessage
  | TextPartialMessage
  | TextFinalMessage
  | ConfigUpdateMessage
  | SessionEndMessage;
```

- [ ] **Step 3: Type-check**

Run:
```bash
cd frontend && printf '{ "extends": "./tsconfig.json", "include": ["src"], "references": [] }\n' > tsconfig.check.json && npx tsc --noEmit -p tsconfig.check.json; echo "exit $?"; rm -f tsconfig.check.json
```
Expected: `exit 0`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/translator.ts
git commit -m "feat(types): add text.partial/text.final client messages"
```

---

## Task 4: Frontend — slice: `sendTextPartial` / `sendTextFinal` / `setCaption`

**Files:**
- Modify: `frontend/src/store/slices/translatorSlice.ts`

**Interfaces:**
- Consumes: `ensureDirection(speaker)` (đã có, trả `TranslatorSocket | null`); state `liveOriginal: PartialLine | null` (đã có).
- Produces: `sendTextPartial(speaker: Speaker, text: string): void`; `sendTextFinal(speaker: Speaker, text: string): void`; `setCaption(speaker: Speaker, text: string | null): void`.

- [ ] **Step 1: Thêm chữ ký vào interface `TranslatorSlice`** — cạnh `sendTurn`:

```typescript
  /** Gửi đoạn text chưa chốt (Web Speech) -> dịch xem trước. */
  sendTextPartial: (speaker: Speaker, text: string) => void;
  /** Gửi đoạn text đã chốt -> dịch chính thức (nmt.result). */
  sendTextFinal: (speaker: Speaker, text: string) => void;
  /** Đặt phụ đề gốc cục bộ (từ Web Speech, Cloud mode); null để xoá. */
  setCaption: (speaker: Speaker, text: string | null) => void;
```

- [ ] **Step 2: Thêm 3 action** — cạnh `sendTurn` trong object trả về:

```typescript
    sendTextPartial: (speaker, text) => {
      const socket = ensureDirection(speaker);
      if (!socket) return;
      socket.send({ type: 'text.partial', data: { speaker, text } });
    },

    sendTextFinal: (speaker, text) => {
      const socket = ensureDirection(speaker);
      if (!socket) return;
      socket.send({ type: 'text.final', data: { speaker, text } });
    },

    setCaption: (speaker, text) =>
      set({ liveOriginal: text ? { speaker, text } : null }),
```

- [ ] **Step 3: Type-check + lint**

Run:
```bash
cd frontend && printf '{ "extends": "./tsconfig.json", "include": ["src"], "references": [] }\n' > tsconfig.check.json && npx tsc --noEmit -p tsconfig.check.json; echo "tsc $?"; rm -f tsconfig.check.json && npx eslint src/store/slices/translatorSlice.ts --max-warnings 0; echo "eslint $?"
```
Expected: `tsc 0` và `eslint 0`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/slices/translatorSlice.ts
git commit -m "feat(store): text translate actions + local caption setter"
```

---

## Task 5: Frontend — hook `useSpeechRecognition`

**Files:**
- Create: `frontend/src/components/hooks/useSpeechRecognition.ts`
- Modify: `frontend/src/components/hooks/index.ts`

**Interfaces:**
- Produces: `useSpeechRecognition(handlers: { onInterim: (text: string) => void; onFinal: (text: string) => void }): { supported: boolean; listening: boolean; error: string | null; start: (lang: string) => void; stop: () => void }`.

- [ ] **Step 1: Tạo hook** `frontend/src/components/hooks/useSpeechRecognition.ts`:

```typescript
/**
 * useSpeechRecognition — bọc Web Speech API cho phụ đề gốc kiểu YouTube.
 *
 * Chỉ dùng ở Cloud mode (audio đi qua dịch vụ của trình duyệt/Google). Trả
 * `supported=false` nếu trình duyệt không hỗ trợ để caller tự fallback.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): { readonly transcript: string };
  [index: number]: { readonly transcript: string };
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    item(index: number): SpeechRecognitionResultLike;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface SpeechRecognitionHandlers {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
}

export interface UseSpeechRecognition {
  supported: boolean;
  listening: boolean;
  error: string | null;
  start: (lang: string) => void;
  stop: () => void;
}

export function useSpeechRecognition(
  handlers: SpeechRecognitionHandlers,
): UseSpeechRecognition {
  const ctorRef = useRef<SpeechRecognitionCtor | null>(getCtor());
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback((lang: string) => {
    const Ctor = ctorRef.current;
    if (!Ctor) return;
    setError(null);
    wantRef.current = true;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          handlersRef.current.onFinal(transcript.trim());
        } else {
          interim += transcript;
        }
      }
      if (interim.trim()) handlersRef.current.onInterim(interim.trim());
    };
    rec.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        setError(`Speech recognition: ${e.error}`);
      }
    };
    rec.onend = () => {
      // Web Speech tự dừng khi im lặng -> nghe lại nếu vẫn muốn.
      if (wantRef.current && recRef.current) {
        try {
          recRef.current.start();
        } catch {
          /* start() có thể ném nếu chưa kịp end; bỏ qua */
        }
      } else {
        setListening(false);
      }
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    wantRef.current = false;
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => () => {
    wantRef.current = false;
    recRef.current?.stop();
  }, []);

  return { supported: ctorRef.current !== null, listening, error, start, stop };
}
```

- [ ] **Step 2: Export trong barrel** `frontend/src/components/hooks/index.ts` — thêm:

```typescript
export { useSpeechRecognition } from './useSpeechRecognition';
export type { UseSpeechRecognition } from './useSpeechRecognition';
```

- [ ] **Step 3: Type-check + lint**

Run:
```bash
cd frontend && printf '{ "extends": "./tsconfig.json", "include": ["src"], "references": [] }\n' > tsconfig.check.json && npx tsc --noEmit -p tsconfig.check.json; echo "tsc $?"; rm -f tsconfig.check.json && npx eslint src/components/hooks/useSpeechRecognition.ts --max-warnings 0; echo "eslint $?"
```
Expected: `tsc 0` và `eslint 0`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/hooks/useSpeechRecognition.ts frontend/src/components/hooks/index.ts
git commit -m "feat(hooks): useSpeechRecognition (Web Speech, YouTube-style captions)"
```

---

## Task 6: Frontend — logic dual-mode: `segmenter.ts` (thuần) + `useTranslationSegmenter`

**Files:**
- Create: `frontend/src/components/hooks/segmenter.ts`
- Create: `frontend/src/components/hooks/useTranslationSegmenter.ts`
- Modify: `frontend/src/components/hooks/index.ts`

**Interfaces:**
- Produces (thuần):
  `initSegmenterState(): SegmenterState`
  `decideSegment(state: SegmenterState, input: { transcript: string; isFinal: boolean; now: number }): { finalText?: string; partialText?: string; caption: string; state: SegmenterState }`
- Produces (hook):
  `useTranslationSegmenter(cb: { onCaption: (t: string) => void; onPartial: (t: string) => void; onFinal: (t: string) => void }): { push: (transcript: string, isFinal: boolean) => void; reset: () => void }`

**Hằng số (Global Constraints):** ngưỡng `2500` ms **HOẶC** `12` từ; "stable" = interim đứng yên `>= 700` ms; debounce partial `>= 600` ms.

- [ ] **Step 1: Tạo hàm thuần** `frontend/src/components/hooks/segmenter.ts`:

```typescript
/**
 * segmenter — quyết định dual-mode (Sentence/Streaming) cho bản dịch.
 *
 * Câu ngắn (chưa vượt ngưỡng) -> chờ trọn câu (Sentence Mode): chỉ emit khi
 * Web Speech báo isFinal. Câu dài (vượt 2.5s HOẶC 12 từ) -> Streaming Mode:
 * emit bản dịch khi cụm ổn định, revise đuôi chưa chốt, giữ cụm đã chốt.
 *
 * Hàm THUẦN: mọi thời gian truyền qua `now` để test được, không đọc đồng hồ.
 */
export const THRESHOLD_MS = 2500;
export const THRESHOLD_WORDS = 12;
export const STABLE_MS = 700;
export const PARTIAL_DEBOUNCE_MS = 600;

export interface SegmenterState {
  /** Số từ đã CHỐT trong transcript câu hiện tại. */
  confirmedWords: number;
  /** Mốc bắt đầu câu hiện tại (ms) hoặc null nếu chưa có từ nào. */
  utteranceStartAt: number | null;
  /** Transcript lần trước (để đo "ổn định"). */
  lastTranscript: string;
  /** Mốc transcript đổi lần cuối (ms). */
  lastChangeAt: number;
  /** Mốc gửi partial gần nhất + nội dung (để debounce + bỏ trùng). */
  lastPartialAt: number;
  lastPartialText: string;
}

export interface SegmentDecision {
  finalText?: string;
  partialText?: string;
  caption: string;
  state: SegmenterState;
}

export function initSegmenterState(): SegmenterState {
  return {
    confirmedWords: 0,
    utteranceStartAt: null,
    lastTranscript: '',
    lastChangeAt: 0,
    lastPartialAt: 0,
    lastPartialText: '',
  };
}

function words(text: string): string[] {
  const t = text.trim();
  return t ? t.split(/\s+/) : [];
}

export function decideSegment(
  prev: SegmenterState,
  input: { transcript: string; isFinal: boolean; now: number },
): SegmentDecision {
  const { transcript, isFinal, now } = input;
  const state: SegmenterState = { ...prev };

  if (state.utteranceStartAt === null && transcript.trim()) {
    state.utteranceStartAt = now;
  }
  if (transcript !== state.lastTranscript) {
    state.lastTranscript = transcript;
    state.lastChangeAt = now;
  }

  const all = words(transcript);
  const tail = all.slice(state.confirmedWords).join(' ');

  // 1) Câu kết thúc -> chốt phần đuôi còn lại, reset cho câu sau.
  if (isFinal) {
    const finalText = tail.trim();
    state.confirmedWords = 0;
    state.utteranceStartAt = null;
    state.lastTranscript = '';
    return finalText
      ? { finalText, caption: '', state }
      : { caption: '', state };
  }

  if (!tail) return { caption: '', state };

  const elapsed = now - (state.utteranceStartAt ?? now);
  const streaming = elapsed >= THRESHOLD_MS || all.length >= THRESHOLD_WORDS;

  // 2) Chưa vượt ngưỡng -> Sentence Mode: chờ, chỉ hiện caption.
  if (!streaming) {
    return { caption: tail, state };
  }

  // 3) Streaming Mode: nếu cụm đuôi đã "ổn định" -> chốt; nếu chưa -> partial (debounce).
  const stable = now - state.lastChangeAt >= STABLE_MS;
  if (stable) {
    state.confirmedWords = all.length;
    state.lastPartialText = '';
    return { finalText: tail, caption: '', state };
  }

  if (now - state.lastPartialAt >= PARTIAL_DEBOUNCE_MS && tail !== state.lastPartialText) {
    state.lastPartialAt = now;
    state.lastPartialText = tail;
    return { partialText: tail, caption: tail, state };
  }

  return { caption: tail, state };
}
```

- [ ] **Step 2: Verify hàm thuần bằng script Node tạm** — tạo `frontend/_seg_check.mjs` (biên dịch nhanh bằng esbuild có sẵn trong Vite? Không — dùng dạng JS thuần sao chép logic sẽ lệch). Thay vào đó verify bằng **type-check** (Step 4) + kịch bản trình duyệt (Task 8). Bỏ qua unit-run vì repo không có test runner. *(Không tạo file.)*

- [ ] **Step 3: Tạo hook** `frontend/src/components/hooks/useTranslationSegmenter.ts`:

```typescript
/**
 * useTranslationSegmenter — bọc `decideSegment` với đồng hồ thật + timer.
 *
 * `push(transcript, isFinal)` mỗi khi Web Speech cập nhật; hook gọi lại
 * onCaption / onPartial / onFinal theo quyết định dual-mode. Có timer nội bộ
 * để phát hiện "cụm ổn định" ngay cả khi người nói ngừng (không có event mới).
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  decideSegment,
  initSegmenterState,
  STABLE_MS,
  type SegmenterState,
} from './segmenter';

export interface SegmenterCallbacks {
  onCaption: (text: string) => void;
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
}

export interface UseTranslationSegmenter {
  push: (transcript: string, isFinal: boolean) => void;
  reset: () => void;
}

export function useTranslationSegmenter(
  cb: SegmenterCallbacks,
): UseTranslationSegmenter {
  const stateRef = useRef<SegmenterState>(initSegmenterState());
  const cbRef = useRef(cb);
  cbRef.current = cb;
  const lastRef = useRef<{ transcript: string; isFinal: boolean }>({
    transcript: '',
    isFinal: false,
  });
  const timerRef = useRef<number | null>(null);

  const apply = useCallback((transcript: string, isFinal: boolean, now: number) => {
    const out = decideSegment(stateRef.current, { transcript, isFinal, now });
    stateRef.current = out.state;
    cbRef.current.onCaption(out.caption);
    if (out.partialText) cbRef.current.onPartial(out.partialText);
    if (out.finalText) cbRef.current.onFinal(out.finalText);
  }, []);

  const push = useCallback(
    (transcript: string, isFinal: boolean) => {
      lastRef.current = { transcript, isFinal };
      apply(transcript, isFinal, Date.now());
    },
    [apply],
  );

  // Timer: nếu người nói ngừng (không event), vẫn kiểm tra "ổn định" để chốt cụm.
  useEffect(() => {
    const id = window.setInterval(() => {
      const { transcript, isFinal } = lastRef.current;
      if (transcript && !isFinal) apply(transcript, false, Date.now());
    }, STABLE_MS);
    timerRef.current = id;
    return () => window.clearInterval(id);
  }, [apply]);

  const reset = useCallback(() => {
    stateRef.current = initSegmenterState();
    lastRef.current = { transcript: '', isFinal: false };
  }, []);

  return { push, reset };
}
```

- [ ] **Step 4: Export barrel** — thêm vào `frontend/src/components/hooks/index.ts`:

```typescript
export { useTranslationSegmenter } from './useTranslationSegmenter';
export {
  decideSegment,
  initSegmenterState,
  THRESHOLD_MS,
  THRESHOLD_WORDS,
} from './segmenter';
export type { SegmenterState, SegmentDecision } from './segmenter';
```

- [ ] **Step 5: Type-check + lint**

Run:
```bash
cd frontend && printf '{ "extends": "./tsconfig.json", "include": ["src"], "references": [] }\n' > tsconfig.check.json && npx tsc --noEmit -p tsconfig.check.json; echo "tsc $?"; rm -f tsconfig.check.json && npx eslint src/components/hooks/segmenter.ts src/components/hooks/useTranslationSegmenter.ts --max-warnings 0; echo "eslint $?"
```
Expected: `tsc 0` và `eslint 0`

- [ ] **Step 6: Verify logic bằng devtools (khi dev server chạy)** — mở Console tại `/translator`, dán:

```js
const { decideSegment, initSegmenterState } = await import('/src/components/hooks/segmenter.ts');
let s = initSegmenterState();
// Câu ngắn, dưới ngưỡng, chưa final -> chỉ caption, KHÔNG final:
let r = decideSegment(s, { transcript: 'xin chào', isFinal: false, now: 0 }); s = r.state;
console.assert(!r.finalText && r.caption === 'xin chào', 'short=caption only');
// isFinal -> chốt:
r = decideSegment(s, { transcript: 'xin chào mọi người', isFinal: true, now: 500 });
console.assert(r.finalText === 'xin chào mọi người', 'final on sentence end');
// Dài > 12 từ, chưa final, ổn định -> chốt cụm:
s = initSegmenterState();
const long = 'a b c d e f g h i j k l m';
r = decideSegment({ ...s, utteranceStartAt: 0, lastChangeAt: 0 }, { transcript: long, isFinal: false, now: 1000 });
console.assert(r.finalText === long, 'streaming confirm long stable phrase');
console.log('segmenter OK');
```
Expected: Console in `segmenter OK` không có assert lỗi.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/hooks/segmenter.ts frontend/src/components/hooks/useTranslationSegmenter.ts frontend/src/components/hooks/index.ts
git commit -m "feat(hooks): dual-mode translation segmenter (2.5s/12-word threshold)"
```

---

## Task 7: Frontend — nối trang: rẽ nhánh nguồn phụ đề theo mode

**Files:**
- Modify: `frontend/src/pages/Translator/index.tsx`

**Interfaces:**
- Consumes: `useSpeechRecognition`, `useTranslationSegmenter` (Task 5, 6); slice `sendTextPartial`, `sendTextFinal`, `setCaption` (Task 4); `useMic`, `sendPartial`, `sendTurn` (đã có, cho Offline).

- [ ] **Step 1: Thêm import + selector** — trong `TranslatorPage`, thêm import và lấy action:

```typescript
import { useMic, useWordReveal, useSpeechRecognition, useTranslationSegmenter } from '@/components/hooks';
```
và thêm selector cạnh các selector hiện có:
```typescript
  const sendTextPartial = useAppStore((s) => s.sendTextPartial);
  const sendTextFinal = useAppStore((s) => s.sendTextFinal);
  const setCaption = useAppStore((s) => s.setCaption);
```

- [ ] **Step 2: Khởi tạo segmenter + speech recognition** — sau `const mic = useMic();`:

```typescript
  const speakerRef = useRef<Speaker | null>(null);
  const segmenter = useTranslationSegmenter({
    onCaption: (text) => {
      const sp = speakerRef.current;
      if (sp) setCaption(sp, text || null);
    },
    onPartial: (text) => {
      const sp = speakerRef.current;
      if (sp) sendTextPartial(sp, text);
    },
    onFinal: (text) => {
      const sp = speakerRef.current;
      if (sp) sendTextFinal(sp, text);
    },
  });
  const speech = useSpeechRecognition({
    onInterim: (text) => segmenter.push(text, false),
    onFinal: (text) => segmenter.push(text, true),
  });
```
(thêm `useRef` vào import React: `import { useCallback, useEffect, useRef, useState } from 'react';`)

- [ ] **Step 3: Chọn luồng Cloud (Web Speech) vs Offline (audio) trong `handleTalk`** — thay thân hàm:

```typescript
  const useSpeechPath = mode === 'cloud' && speech.supported;

  const handleTalk = useCallback(
    async (speaker: Speaker): Promise<void> => {
      if (activeSpeaker === speaker) {
        // Dừng
        setActiveSpeaker(null);
        speakerRef.current = null;
        if (useSpeechPath) {
          speech.stop();
          segmenter.push('', true); // chốt đuôi còn lại
          segmenter.reset();
          setCaption(speaker, null);
        } else {
          const audio = await mic.stop();
          if (audio) sendTurn(speaker, audio);
        }
      } else if (activeSpeaker === null) {
        // Bắt đầu
        setActiveSpeaker(speaker);
        speakerRef.current = speaker;
        if (useSpeechPath) {
          segmenter.reset();
          speech.start(speaker === 'vn' ? 'vi-VN' : 'en-US');
        } else {
          await mic.start((audioBase64) => sendPartial(speaker, audioBase64));
        }
      }
    },
    [activeSpeaker, mic, sendPartial, sendTurn, useSpeechPath, speech, segmenter, setCaption],
  );
```

- [ ] **Step 4: Hiển thị lỗi speech + chú thích fallback** — trong khối error banner, gộp `speech.error`:

```tsx
      {(error || mic.error || speech.error) && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {speech.error ?? mic.error ?? error}
        </div>
      )}
      {mode === 'cloud' && !speech.supported && (
        <div className="rounded-lg border border-amber-400/40 bg-amber-50/60 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-300">
          Trình duyệt không hỗ trợ nhận dạng giọng nói — tự dùng luồng Whisper (windowed).
        </div>
      )}
```

- [ ] **Step 5: Type-check + lint**

Run:
```bash
cd frontend && printf '{ "extends": "./tsconfig.json", "include": ["src"], "references": [] }\n' > tsconfig.check.json && npx tsc --noEmit -p tsconfig.check.json; echo "tsc $?"; rm -f tsconfig.check.json && npx eslint src/pages/Translator/index.tsx --max-warnings 0; echo "eslint $?"
```
Expected: `tsc 0` và `eslint 0`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Translator/index.tsx
git commit -m "feat(translator): Web Speech captions (cloud) + Whisper (offline) branch"
```

---

## Task 8: Xác minh end-to-end (2 luồng) + cập nhật tài liệu

**Files:**
- Modify: `HUONG_DAN_TEST.md` (thêm mục kiểm thử dual-mode + Web Speech)

- [ ] **Step 1: Chạy 2 server**

```bash
# cửa sổ 1
cd backend && .venv/Scripts/Activate.ps1 && uvicorn app.main:app --reload
# cửa sổ 2
cd frontend && npm run dev
```

- [ ] **Step 2: Kịch bản Cloud (Chrome) — quan sát mong đợi**
  - Mở `http://localhost:3000/translator`, mode = **Cloud**.
  - Bấm **Nhấn để nói** (VN), nói **câu ngắn** "Xin chào mọi người" rồi ngừng → phụ đề gốc chạy word-by-word; **bản dịch xuất hiện MỘT LẦN khi dứt câu** ("Hello everyone") — Sentence Mode.
  - Bấm nói (VN), nói **câu dài > 12 từ / > 2.5s** liền mạch → bản dịch **chốt dần theo cụm**, cụm đã chốt **không đổi** khi nói tiếp — Streaming Mode.
  - Kiểm tra bảo toàn: nói "Công ty ABC ký 3 hợp đồng ngày 5 tháng 1" → bản dịch giữ `ABC`, `3`, `5`.
  - Thử phía SG (English) → dịch sang tiếng Việt ở panel VN.

- [ ] **Step 3: Kịch bản Offline**
  - Bấm nút **Chế độ → Offline** (nếu backend có model; nếu không, để **Mock**) → luồng vẫn chạy bằng đường AUDIO (Whisper/mock windowed), không lỗi.

- [ ] **Step 4: Fallback trình duyệt** — mở bằng Firefox (nếu có) → hiện chú thích "không hỗ trợ" và tự chạy luồng Whisper windowed.

- [ ] **Step 5: Cập nhật `HUONG_DAN_TEST.md`** — thêm mục "Tầng 5 — Dual-mode (Cloud/Web Speech)" mô tả 3 kịch bản ở Step 2 với kết quả mong đợi (Sentence vs Streaming, bảo toàn entity, fallback).

- [ ] **Step 6: Commit**

```bash
git add HUONG_DAN_TEST.md
git commit -m "docs: test scenarios for dual-mode YouTube captions"
```

---

## Self-Review (đã thực hiện)

- **Spec coverage:** Web Speech captions (Task 5,7) · dual-mode threshold 2.5s/12-word (Task 6) · phrase-based + entity-preserving prompt (Task 1) · text path backend (Task 2) · client messages (Task 3) · caption tail/confirmed-turns (Task 6 `confirmedWords` + slice `setCaption`) · offline giữ nguyên (Task 7 nhánh else) · fallback không hỗ trợ (Task 7 Step 4). ✔
- **Placeholder scan:** không có TODO/TBD; mọi step có code/lệnh cụ thể. (Task 6 Step 2 cố ý KHÔNG tạo file test vì repo không có runner — đã nêu rõ.)
- **Type consistency:** `decideSegment`/`SegmenterState`/`initSegmenterState` khớp giữa `segmenter.ts`, hook, và barrel; `sendTextPartial`/`sendTextFinal`/`setCaption` khớp giữa slice và page; `useSpeechRecognition` handlers `{onInterim,onFinal}` khớp page. ✔
