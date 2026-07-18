# Rolling-Segment VAD TTS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Meeting cắt cụm bằng VAD khi đang nói để bản dịch + audio từng cụm phát cuốn chiếu trên máy người nghe (giống `backend/static/index.html`).

**Architecture:** Chỉ frontend. `WebMicRecorder` thêm VAD năng lượng → gọi callback biên cụm; `useMeetingMic` nối callback (web) / timer (native) vào `commitSegment` (audio.chunk), bỏ `audio.partial`; `Demo4Meeting` cho hero bám cụm đang phát audio để caption cuốn chiếu khớp giọng. Backend không đổi — đã STT+NMT+TTS mỗi `audio.chunk` và route `tts.audio` sang peer; `playBase64Audio` đã phát tuần tự.

**Tech Stack:** Expo / React Native 0.76, TypeScript strict (`noUnusedLocals`/`noUnusedParameters` = true), Web Audio API, Zustand.

## Global Constraints

- **Không `any`** trừ chỗ đã có sẵn (`err: any` trong catch giữ nguyên phong cách file).
- **`noUnusedLocals`/`noUnusedParameters` = true** → phải xoá sạch biến/hàm/param không dùng, nếu không `npm run typecheck` fail.
- **Không đụng:** backend, giao thức WS, `audio.partial` path trong store (giữ cho `/app` & tools), mặc định `ttsOn`.
- **Gate mỗi task:** `npm run typecheck` (zero error). Lint hỏng sẵn toàn repo (thiếu `eslint.config.js`) — không phải việc của plan này.
- **VAD constants:** `SPEECH_RMS=0.012, SILENCE_MS=650, MIN_SEG_MS=500, MAX_SEG_MS=6000`. **Native cut:** `NATIVE_SEG_MS=4000`.
- Chạy lệnh từ `frontend/`.

---

### Task 1: VAD trong `WebMicRecorder`

**Files:**
- Modify: `frontend/src/services/webAudioCapture.ts`

**Interfaces:**
- Consumes: —
- Produces: `WebMicRecorder.start(onSegment?: () => void): Promise<void>` — `onSegment` được gọi mỗi khi VAD phát hiện biên cụm. `windowWav()` trả WAV của cụm hiện tại (speech-only, từ lần `reset()` gần nhất). `reset()`/`stop()` giữ nguyên chữ ký.

- [ ] **Step 1: Thêm hằng số VAD**

Dưới `const TARGET_RATE = 16000;` (webAudioCapture.ts:13) thêm:

```ts
// VAD năng lượng (port từ backend/static/index.html). Chỉnh SPEECH_RMS nếu mic to/nhỏ.
const SPEECH_RMS = 0.012; // ngưỡng coi là đang nói
const SILENCE_MS = 650; // ngừng bao lâu thì chốt cụm
const MIN_SEG_MS = 500; // cụm tối thiểu (bỏ tiếng động ngắn)
const MAX_SEG_MS = 6000; // cụm dài liền mạch → cắt cưỡng bức
```

- [ ] **Step 2: Thêm field VAD + `onSegment` vào class**

Trong `class WebMicRecorder`, sau `private inRate = 48000;` (webAudioCapture.ts:21) thêm:

```ts
  private onSegment?: () => void;
  private speaking = false;
  private silenceMs = 0;
  private segMs = 0;
```

- [ ] **Step 3: Đổi `start()` nhận callback + VAD trong `onaudioprocess`**

Thay chữ ký và thân xử lý frame. Đổi dòng `async start(): Promise<void> {` (webAudioCapture.ts:24) thành `async start(onSegment?: () => void): Promise<void> {` và thêm `this.onSegment = onSegment;` ngay sau `this.chunks = [];`. Thay khối gán `this.processor.onaudioprocess = ...` (webAudioCapture.ts:37-39) bằng:

```ts
    this.onSegment = onSegment;
    this.processor.onaudioprocess = (e) => {
      const frame = new Float32Array(e.inputBuffer.getChannelData(0));
      const frameMs = (frame.length / this.inRate) * 1000;
      let sum = 0;
      for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
      const rms = Math.sqrt(sum / frame.length);
      if (rms > SPEECH_RMS) {
        this.speaking = true;
        this.silenceMs = 0;
      } else if (this.speaking) {
        this.silenceMs += frameMs;
      }
      // Chỉ gom frame khi đang nói → cụm là speech-only (bỏ im lặng thừa).
      if (this.speaking) {
        this.chunks.push(frame);
        this.segMs += frameMs;
      }
      // Biên cụm: ngắt hơi đủ lâu (cụm ≥ min) hoặc cụm quá dài → chốt.
      if (
        (this.speaking && this.silenceMs >= SILENCE_MS && this.segMs >= MIN_SEG_MS) ||
        this.segMs >= MAX_SEG_MS
      ) {
        this.speaking = false;
        this.silenceMs = 0;
        this.segMs = 0;
        this.onSegment?.();
      }
    };
```

> `this.chunks = [];` ở dòng trên đó (webAudioCapture.ts:36) giữ nguyên. Chỉ có 1 lần gán `this.onSegment = onSegment;` — đặt ngay trên `this.processor.onaudioprocess`.

- [ ] **Step 4: Reset VAD state trong `reset()` và `stop()`**

Đổi `reset()` (webAudioCapture.ts:45-47) để cũng xoá state VAD (cụm mới sạch):

```ts
  reset(): void {
    this.chunks = [];
    this.speaking = false;
    this.silenceMs = 0;
    this.segMs = 0;
  }
```

Trong `stop()`, trước `return result;` (cuối hàm), thêm `this.onSegment = undefined;` để không giữ callback sau khi dừng.

- [ ] **Step 5: Gate — typecheck**

Run: `npm run typecheck`
Expected: zero error.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/webAudioCapture.ts
git commit -m "feat(mic): WebMicRecorder detects phrase boundaries via energy VAD"
```

---

### Task 2: `useMeetingMic` — cắt cụm thay vì gửi partial

**Files:**
- Modify: `frontend/src/components/hooks/useMeetingMic.ts` (thay toàn bộ nội dung)

**Interfaces:**
- Consumes: `WebMicRecorder.start(onSegment)` (Task 1); store actions `startTurn`, `commitSegment`, `endTurn`.
- Produces: `useMeetingMic(): MeetingMic` với `{ recording, error, start, cut, stop }` — hành vi: web cắt cụm bằng VAD (mỗi cụm `commitSegment`), native cắt mỗi `NATIVE_SEG_MS` bằng `cut()`, `stop()` gửi cụm cuối. Không còn gửi `audio.partial`.

- [ ] **Step 1: Thay toàn bộ nội dung file**

Ghi đè `frontend/src/components/hooks/useMeetingMic.ts` bằng:

```ts
/**
 * useMeetingMic — thu âm push-to-talk cắt CỤM (VAD), ĐA NỀN TẢNG.
 *
 *   - Web/Desktop (Expo Web, Electron): Web Audio API + VAD năng lượng
 *     (WebMicRecorder) → cắt cụm ở chỗ ngắt hơi, mỗi cụm gửi `audio.chunk`.
 *   - iOS/Android: expo-audio; cắt cưỡng bức theo giờ (~NATIVE_SEG_MS) qua stop/
 *     read/restart rồi gộp PCM.
 *
 * Mỗi cụm là một `audio.chunk` (backend STT+NMT+TTS → audio phát cuốn chiếu trên
 * máy người nghe). KHÔNG còn gửi `audio.partial` (dịch dự đoán) trong luồng này.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { AudioModule, setAudioModeAsync, useAudioRecorder } from 'expo-audio';

import {
  WAV_16K,
  base64ToBytes,
  bytesToBase64,
  concatPcm,
  pcmToWav,
  readFileBase64,
  wavToPcm,
} from '@/services/audioCapture';
import { WebMicRecorder } from '@/services/webAudioCapture';
import { useStore } from '@/store';
import type { Speaker } from '@/types/translator';

const NATIVE_SEG_MS = 4000;
const IS_WEB = Platform.OS === 'web';

export interface MeetingMic {
  recording: boolean;
  error: string | null;
  start: (speaker: Speaker) => Promise<void>;
  /** Chốt cụm hiện tại (audio.chunk → một lượt) rồi thu tiếp cụm mới. */
  cut: () => Promise<void>;
  stop: () => Promise<void>;
}

export function useMeetingMic(): MeetingMic {
  const recorder = useAudioRecorder(WAV_16K); // dùng cho native
  const startTurn = useStore((s) => s.startTurn);
  const commitSegment = useStore((s) => s.commitSegment);
  const endTurn = useStore((s) => s.endTurn);

  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liveRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speakerRef = useRef<Speaker>('vn');
  // Gọi cut() bản mới nhất từ VAD callback / timer mà không đăng ký lại.
  const cutRef = useRef<() => Promise<void>>(async () => {});

  // Web recorder (Web Audio API + VAD).
  const webRef = useRef<WebMicRecorder | null>(null);
  // Native: PCM tích luỹ + xâu chuỗi thao tác recorder.
  const pcmChunksRef = useRef<Uint8Array[]>([]);
  const opChainRef = useRef<Promise<void>>(Promise.resolve());

  const runExclusive = useCallback((fn: () => Promise<void>): Promise<void> => {
    opChainRef.current = opChainRef.current.then(fn, fn);
    return opChainRef.current;
  }, []);

  // --- Native: cắt đoạn, đọc PCM, cộng dồn, thu tiếp ------------------------
  const flushNative = useCallback(
    (restart: boolean) =>
      runExclusive(async () => {
        try {
          await recorder.stop();
        } catch {
          return;
        }
        const uri = recorder.uri;
        if (uri) {
          try {
            const b64 = await readFileBase64(uri);
            const pcm = wavToPcm(base64ToBytes(b64));
            if (pcm.length > 0) pcmChunksRef.current.push(pcm);
          } catch {
            /* bỏ qua lỗi đọc một đoạn */
          }
        }
        if (restart && liveRef.current) {
          try {
            await recorder.prepareToRecordAsync();
            recorder.record();
          } catch (err: any) {
            setError('Ghi âm đoạn tiếp theo thất bại: ' + (err?.message ?? String(err)));
          }
        }
      }),
    [recorder, runExclusive],
  );

  const cut = useCallback(async (): Promise<void> => {
    if (!liveRef.current) return;
    let wav: string | null = null;
    if (IS_WEB) {
      wav = webRef.current?.windowWav() ?? null;
      webRef.current?.reset();
    } else {
      await flushNative(true); // đọc đoạn cuối + thu tiếp cụm mới
      if (pcmChunksRef.current.length > 0) {
        wav = bytesToBase64(pcmToWav(concatPcm(pcmChunksRef.current)));
      }
      pcmChunksRef.current = [];
    }
    if (wav) commitSegment(speakerRef.current, wav);
  }, [flushNative, commitSegment]);
  cutRef.current = cut;

  const start = useCallback(
    async (speaker: Speaker): Promise<void> => {
      setError(null);
      try {
        if (IS_WEB) {
          webRef.current = new WebMicRecorder();
          // VAD phát hiện biên cụm → chốt cụm (audio.chunk).
          await webRef.current.start(() => void cutRef.current());
        } else {
          const perm = await AudioModule.requestRecordingPermissionsAsync();
          if (!perm.granted) {
            setError('Không có quyền micro. Kiểm tra cài đặt quyền của app.');
            return;
          }
          await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
          pcmChunksRef.current = [];
          await recorder.prepareToRecordAsync();
          recorder.record();
        }
        speakerRef.current = speaker;
        startTurn(speaker);
        liveRef.current = true;
        setRecording(true);
        // Native không có VAD → cắt cưỡng bức theo giờ.
        if (!IS_WEB) {
          timerRef.current = setInterval(() => void cutRef.current(), NATIVE_SEG_MS);
        }
      } catch (err: any) {
        liveRef.current = false;
        setError('Không truy cập được micro: ' + (err?.message ?? String(err)));
      }
    },
    [recorder, startTurn],
  );

  const stop = useCallback(async (): Promise<void> => {
    if (!liveRef.current) return;
    liveRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);

    let finalWav: string | null = null;
    if (IS_WEB) {
      finalWav = (await webRef.current?.stop()) ?? null;
      webRef.current = null;
    } else {
      await flushNative(false);
      if (pcmChunksRef.current.length > 0) {
        finalWav = bytesToBase64(pcmToWav(concatPcm(pcmChunksRef.current)));
      }
    }
    if (finalWav) endTurn(speakerRef.current, finalWav);
  }, [flushNative, endTurn]);

  // Dọn khi rời màn hình.
  useEffect(
    () => () => {
      liveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (IS_WEB) void webRef.current?.stop();
      else recorder.stop().catch(() => undefined);
    },
    [recorder],
  );

  return { recording, error, start, cut, stop };
}
```

> Thay đổi so với bản cũ: bỏ `sendPartialAudio`/`partialResponses`, `awaitingRef`/`lastAtRef`/`COALESCE_TIMEOUT`, `onTick`/`buildWindow`, `SEGMENT_MS`. Web dùng VAD callback; native dùng timer `NATIVE_SEG_MS` gọi `cut()`.

- [ ] **Step 2: Gate — typecheck**

Run: `npm run typecheck`
Expected: zero error (không còn biến/hàm thừa).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/hooks/useMeetingMic.ts
git commit -m "feat(mic): segment turns via VAD (web) / interval (native), drop partials"
```

---

### Task 3: `Demo4Meeting` — hero bám cụm đang phát audio

**Files:**
- Modify: `frontend/src/screens/rtt/Demo4Meeting.tsx`

**Interfaces:**
- Consumes: store `audioCue`, `turns`, `live`; `TranslatorTurn.id`.
- Produces: hero + caption bám cụm đang được đọc (audio đang phát), cuốn chiếu khớp giọng.

- [ ] **Step 1: Tính `playingTurn` và đổi hero dùng nó**

Thay khối tính hero (Demo4Meeting.tsx:213-221) bằng:

```ts
  // Cụm đang được ĐỌC (audio đang phát) — hero bám theo để chữ khớp tai; audio
  // phát cuốn chiếu (hàng đợi) nên trễ hơn lúc chữ về.
  const playingTurn = audioCue ? turns.find((t) => t.id === audioCue.turnId) ?? null : null;
  // Dùng `||` (không phải `??`) để chuỗi rỗng cũng rơi xuống fallback.
  const heroBig = speaking
    ? live?.srcText || ''
    : playingTurn?.dstText || lastPeer?.dstText || '';
  const heroSrc = speaking ? '' : playingTurn?.srcText || lastPeer?.srcText || '';
  // Hero khớp audio khi ĐANG NGHE: ưu tiên cụm đang phát, fallback lượt gần nhất.
  const heroTurnId = !speaking ? playingTurn?.id ?? lastPeer?.id : undefined;
  const cue = audioCue && audioCue.turnId === heroTurnId ? audioCue : null;
  const typed = useReveal(heroBig, { syncMs: cue?.durationMs, syncKey: heroTurnId });
  const typing = typed.length < heroBig.length;
```

> `live` vẫn được tham chiếu ở nhánh `speaking` (stt.partial khi mình đang nói STT một cụm) nên không bị lỗi `noUnusedLocals`. `lastPeer` (Demo4Meeting.tsx:209-212) và `audioCue` select giữ nguyên.

- [ ] **Step 2: Gate — typecheck**

Run: `npm run typecheck`
Expected: zero error.

- [ ] **Step 3: Kiểm chứng runtime (2 tab web)**

Chạy backend (`edge` TTS mặc định để có audio; hoặc `cloud` có key) + `npm run web`; mở 2 tab localhost, ghép phòng. Trên máy NGHE:

1. **Cuốn chiếu:** người nói giữ nút và nói câu dài có ngắt hơi ("Xin chào … tôi tên là Nam … rất vui được gặp bạn") → audio cụm 1 phát khi người nói còn đang nói cụm sau; các cụm phát lần lượt không đè.
2. **Hero bám giọng:** chữ hero hiện đúng cụm đang nghe, chuyển cụm khi audio chuyển; chữ nhảy khớp audio từng cụm.
3. **Cắt VAD:** cụm cắt ở chỗ ngắt hơi, không giữa từ; nói tiếng động ngắn (<0.5s) không tạo cụm rác.
4. **MAX_SEG:** nói liền >6s không nghỉ → vẫn bị cắt.
5. **Thả nút:** cụm cuối (đang nói dở) được gửi và đọc.
6. **ttsOn off:** tắt loa → vẫn hiện chữ theo cụm, không kẹt, không tiếng.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/screens/rtt/Demo4Meeting.tsx
git commit -m "feat(meeting): hero + caption follow the currently-playing segment"
```

---

## Self-Review

**Spec coverage:**
- §Kiến trúc/1 VAD trong WebMicRecorder → Task 1 (Steps 1-4). ✅
- §Kiến trúc/2 useMeetingMic cụm thay partial (web VAD + native timer, bỏ partial/coalesce) → Task 2. ✅
- §Kiến trúc/3 hero bám cụm đang phát → Task 3 (Step 1). ✅
- §Luồng dữ liệu người nghe → Task 2 (commitSegment) + audioPlayback (đã có) + Task 3 (playingTurn). ✅
- §Xử lý lỗi & biên: cụm rỗng (`windowWav()` null → không commit; Task 1 chỉ gom speech frame), audioCue trỏ turn cũ (`turns.find` undefined → fallback lastPeer, Task 3), ttsOn=false (audioCue null → lastPeer + fallback typing, Task 3), native gap (flushNative giữ nguyên). ✅
- §Kiểm thử → Task 3 Step 3 (mục 1-6). ✅

**Placeholder scan:** không có TBD/TODO; mọi step có code/lệnh cụ thể. ✅

**Type consistency:** `start(onSegment?)` khớp giữa Task 1 (khai) và Task 2 (gọi `webRef.current.start(() => void cutRef.current())`); `commitSegment(speaker, wav)`/`endTurn`/`startTurn` khớp chữ ký store hiện có; `audioCue.turnId`/`TranslatorTurn.id` khớp giữa Task 3 và store; `cut`/`stop`/`start` khớp interface `MeetingMic`. ✅

**noUnusedLocals check:** Task 2 bỏ hết biến không dùng (`sendPartialAudio`, `partialResponses`, `awaitingRef`, `lastAtRef`, `onTick`, `buildWindow`, `SEGMENT_MS`, `COALESCE_TIMEOUT`); Task 3 giữ `live` được dùng ở nhánh speaking. ✅
