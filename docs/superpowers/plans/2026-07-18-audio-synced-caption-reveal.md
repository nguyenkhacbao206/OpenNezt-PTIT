# Audio-Synced Hero Caption Reveal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khi bản dịch chốt + TTS audio về máy người nghe, chữ hero ở màn Meeting reset và gõ lại khớp đúng lúc/đúng độ dài audio (chữ nhảy cùng lúc tiếng).

**Architecture:** Ba đơn vị nối bằng interface hẹp: (1) `audioPlayback.ts` báo ngược `onStart(durationMs)` khi clip thực sự phát; (2) `translatorSlice.ts` biến tín hiệu đó thành state `audioCue` gắn với turn đối tác; (3) `useReveal` trong `Demo4Meeting.tsx` đọc `audioCue` để pace nhịp gõ theo độ dài audio và reset khi sang turn mới. Service không import store — chỉ trả tín hiệu qua callback caller truyền vào (tôn trọng ranh giới layer trong `frontend/claude.md`).

**Tech Stack:** Expo / React Native 0.76, TypeScript strict, Zustand (slices), expo-audio, Web `Audio`.

## Global Constraints

- **Không `any`.** TypeScript strict — dùng kiểu chính xác (`frontend/claude.md` §1, §5).
- **Layer boundaries:** `services/` KHÔNG import `store/` hay `screens/` (`frontend/claude.md` §3). `audioPlayback.ts` chỉ nhận callback.
- **Không đụng:** backend, giao thức WS, các màn khác, mặc định `ttsOn=false`.
- **Gate mỗi task:** `npm run typecheck` (zero error) + `npm run lint` sạch. Không có jest trong repo — không bịa test runner; kiểm chứng hành vi bằng quan sát runtime mô tả trong từng task.
- **Cách sync đã chốt:** ① reset & gõ lại khớp audio, giữ preview dự đoán. **Fallback:** không có tín hiệu audio khớp trong ~400ms ⇒ gõ nhịp cố định 55ms.
- Chạy lệnh từ thư mục `frontend/`.

---

### Task 1: `audioPlayback` báo ngược thời điểm & độ dài audio

**Files:**
- Modify: `frontend/src/services/audioPlayback.ts`

**Interfaces:**
- Consumes: —
- Produces: `playBase64Audio(base64: string, onStart?: (durationMs: number) => void): void`. `onStart` được gọi **tối đa một lần** cho clip khi nó thực sự bắt đầu phát, kèm độ dài clip theo mili-giây. Không gọi nếu clip bị bỏ qua/lỗi/không phát được.

- [ ] **Step 1: Đổi hàng đợi để mang theo `onStart` cho từng clip**

Trong `frontend/src/services/audioPlayback.ts`, đổi kiểu hàng đợi và chữ ký hàm public:

```ts
type Clip = { base64: string; onStart?: (durationMs: number) => void };
const queue: Clip[] = [];
let busy = false;
let seq = 0;

/** Xếp một clip base64 vào hàng đợi; tự phát nếu đang rảnh. */
export function playBase64Audio(base64: string, onStart?: (durationMs: number) => void): void {
  if (!base64) return;
  queue.push({ base64, onStart });
  if (!busy) void playNext();
}
```

Và trong `playNext`, lấy clip ra dạng object:

```ts
async function playNext(): Promise<void> {
  const clip = queue.shift();
  if (!clip) {
    busy = false;
    return;
  }
  busy = true;
  const { base64, onStart } = clip;
  // ...phần còn lại giữ nguyên (advance, ext, ...) nhưng dùng biến `base64` như cũ
```

- [ ] **Step 2: Web — gọi `onStart` với độ dài clip khi bắt đầu phát**

Trong nhánh `if (Platform.OS === 'web')`, thêm cờ một-lần và phát tín hiệu sau khi metadata sẵn sàng. Thay khối `try` hiện tại bằng:

```ts
  if (Platform.OS === 'web') {
    try {
      const mime = ext === 'wav' ? 'audio/wav' : 'audio/mpeg';
      const audio = new Audio(`data:${mime};base64,${base64}`);
      let started = false;
      const fireStart = () => {
        if (started || !onStart) return;
        const ms = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0;
        if (ms > 0) {
          started = true;
          onStart(ms);
        }
      };
      audio.onloadedmetadata = fireStart;
      audio.onplay = fireStart;
      audio.onended = () => advance();
      audio.onerror = () => advance();
      // Chốt an toàn nếu không nhận được 'ended'.
      setTimeout(() => advance(), 30000);
      // Có thể bị chặn nếu trang chưa có tương tác người dùng → bỏ qua clip.
      await audio.play();
      fireStart();
    } catch {
      advance();
    }
    return;
  }
```

- [ ] **Step 3: Native — gọi `onStart` từ status update đầu tiên có `duration>0`**

Trong nhánh NATIVE (`try` với `createAudioPlayer`), thêm cờ và phát tín hiệu trong listener:

```ts
  try {
    const path = `${FileSystem.cacheDirectory}tts-${(seq += 1)}.${ext}`;
    await FileSystem.writeAsStringAsync(path, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const player = createAudioPlayer(path);
    let started = false;
    player.addListener('playbackStatusUpdate', (status) => {
      if (!started && onStart && status.playing && (status.duration ?? 0) > 0) {
        started = true;
        onStart((status.duration ?? 0) * 1000);
      }
      if (status.didJustFinish) advance(player);
    });
    // Chốt an toàn: nếu vì lý do gì không nhận được didJustFinish.
    setTimeout(() => advance(player), 30000);
    player.play();
  } catch {
    advance();
  }
```

> Ghi chú: `expo-audio` trả `duration` theo **giây** trong `playbackStatusUpdate`; nếu TypeScript báo `status.duration` có thể `undefined`, dùng `?? 0` như trên (đã có). Nếu tên trường khác ở phiên bản đang cài, kiểm bằng cách log `status` một lần rồi chỉnh — không dùng `any`, khai kiểu tại chỗ nếu cần.

- [ ] **Step 4: Gate — typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: zero error, không cảnh báo mới.

- [ ] **Step 5: Kiểm chứng runtime (tuỳ chọn nhanh)**

Tạm thời trong một chỗ gọi thử (hoặc để lại cho Task 2), xác nhận build web chạy được (`npm run web` mở được app). Không cần quan sát audio ở task này — Task 2 nối tín hiệu vào store.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/audioPlayback.ts
git commit -m "feat(audio): playBase64Audio reports clip start + duration via onStart"
```

---

### Task 2: Store `audioCue` — nối tín hiệu audio vào turn đối tác

**Files:**
- Modify: `frontend/src/store/slices/translatorSlice.ts`

**Interfaces:**
- Consumes: `playBase64Audio(base64, onStart?)` từ Task 1.
- Produces: state `audioCue: AudioCue | null` với `type AudioCue = { turnId: string; startedAt: number; durationMs: number }`. `turnId` khớp `TranslatorTurn.id` của lượt đối tác vừa chốt (`mine=false`). `null` khi vào phòng / khi mình bắt đầu lượt nói mới / khi `clearTurns`.

- [ ] **Step 1: Khai kiểu + trường interface + default state**

Thêm kiểu (cạnh các import/kiểu đầu file, hoặc ngay trên `interface TranslatorSlice`):

```ts
export type AudioCue = { turnId: string; startedAt: number; durationMs: number };
```

Trong `interface TranslatorSlice` (cạnh `metrics`/`partialResponses`, ~dòng 69–72) thêm:

```ts
  /** Tín hiệu audio TTS đang phát cho lượt đối tác — để hero gõ chữ khớp giọng. */
  audioCue: AudioCue | null;
```

Trong object state khởi tạo (nơi có `turns: []`, `live: null`, `metrics: null`, ~dòng 287) thêm:

```ts
    audioCue: null,
```

- [ ] **Step 2: Thêm biến closure nhớ turn đối tác gần nhất**

Trong thân `createTranslatorSlice` (cạnh `directionKey`/`ensureSession`, ~dòng 132), thêm:

```ts
  // Id của turn đối tác vừa chốt — dùng để gắn audioCue cho đúng lượt.
  let lastPeerTurnId: string | null = null;
```

- [ ] **Step 3: Gắn `lastPeerTurnId` khi tạo turn đối tác ở `nmt.result`**

Trong `case 'nmt.result'` (~dòng 193–208), sau khi tạo `seg`, nhớ id và reset cue cũ:

```ts
      case 'nmt.result': {
        const seg: TranslatorTurn = {
          id: makeId(),
          speaker: event.data.speaker,
          srcText: event.data.srcText,
          dstText: event.data.dstText,
          mine: false,
        };
        lastPeerTurnId = seg.id;
        set({
          live: null,
          turns: [...get().turns, seg],
          partialResponses: get().partialResponses + 1,
          audioCue: null, // sẽ set lại khi tts.audio thực sự phát
        });
        break;
      }
```

- [ ] **Step 4: Phát cue khi `tts.audio` bắt đầu phát**

Đổi `case 'tts.audio'` (~dòng 210–213):

```ts
      case 'tts.audio': {
        // Audio bản dịch của đối tác — phát trên máy tôi (nếu bật đọc). Khi clip
        // thật sự phát, ghi audioCue để hero gõ chữ khớp độ dài giọng.
        if (get().ttsOn) {
          const turnId = lastPeerTurnId;
          void playBase64Audio(event.data.audio, (durationMs) => {
            if (turnId) set({ audioCue: { turnId, startedAt: Date.now(), durationMs } });
          });
        }
        break;
      }
```

- [ ] **Step 5: Reset `audioCue` khi mình bắt đầu lượt nói mới (`stt.final`)**

Trong `case 'stt.final'` (~dòng 166–185), khi tạo `mineTurn`, xoá cue của đối tác để hero lời-mình không bị pace theo audio cũ. Thêm `audioCue: null` vào object `set`:

```ts
        if (text) {
          const mineTurn: TranslatorTurn = {
            id: makeId(),
            speaker: event.data.speaker,
            srcText: text,
            dstText: text,
            mine: true,
          };
          next.turns = [...get().turns, mineTurn];
        }
        set({ ...next, audioCue: null });
```

> Lưu ý kiểu: `next` hiện là `{ partialResponses: number; turns?: TranslatorTurn[] }`. Trải `...next` rồi thêm `audioCue: null` không phá kiểu.

- [ ] **Step 6: Reset `audioCue` ở `room.joined` và `clearTurns`**

Trong `case 'room.joined'` (~dòng 242–253) thêm `audioCue: null` vào object `set` (cạnh `turns: []`, `live: null`).
Trong `clearTurns` (~dòng 496) thêm `audioCue: null`:

```ts
    clearTurns: () => set({ turns: [], sessionSegments: [], live: null, metrics: null, audioCue: null }),
```

Và reset biến closure ở `room.joined` (ngay sau `set({...})` trong case đó, trước `break`):

```ts
        lastPeerTurnId = null;
```

- [ ] **Step 7: Gate — typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: zero error, không cảnh báo mới.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/store/slices/translatorSlice.ts
git commit -m "feat(store): audioCue links TTS clip start/duration to peer turn"
```

---

### Task 3: `useReveal` pace theo audio + reset theo turn

**Files:**
- Modify: `frontend/src/screens/rtt/Demo4Meeting.tsx`

**Interfaces:**
- Consumes: `audioCue: AudioCue | null` từ store (Task 2); `TranslatorTurn.id`.
- Produces: hành vi UI — hero gõ khớp audio; không có API mới cho task khác.

- [ ] **Step 1: Mở rộng `useReveal` nhận opts (syncMs, syncKey, cadence)**

Thay hook `useReveal` (Demo4Meeting.tsx:26–53) bằng:

```ts
/**
 * Chạy chữ dần theo từng từ ("đánh máy"), tránh giật cả cụm.
 * - `syncMs`: độ dài audio (ms) — nếu có, pace nhịp để chạy trọn audio.
 * - `syncKey`: đổi key ⇒ lượt mới, reset về đầu và gõ lại từ đầu.
 * - Fallback: khi `syncKey` mới mà chưa có `syncMs`, hoãn bắt đầu gõ tối đa
 *   ~400ms chờ audio; hết 400ms vẫn chưa có thì gõ nhịp mặc định.
 */
function useReveal(
  text: string,
  opts?: { syncMs?: number; syncKey?: string; cadence?: number },
): string {
  const { syncMs, syncKey, cadence: baseCadence = 55 } = opts ?? {};
  const [shown, setShown] = useState('');
  const wordsRef = useRef<string[]>([]);
  const iRef = useRef(0);
  const keyRef = useRef<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const words = (text || '').split(/\s+/).filter(Boolean);
    wordsRef.current = words;

    // Lượt mới (syncKey đổi) → reset về đầu để gõ lại khớp audio.
    if (syncKey !== keyRef.current) {
      keyRef.current = syncKey;
      iRef.current = 0;
    }
    if (iRef.current > words.length) iRef.current = 0; // text ngắn lại → lượt mới

    // Nhịp: có syncMs thì trải đều theo độ dài audio, kẹp 40..400ms.
    const cadence =
      syncMs && words.length > 0
        ? Math.min(400, Math.max(40, syncMs / words.length))
        : baseCadence;

    // Hoãn bắt đầu tối đa 400ms nếu đang chờ audio (có syncKey nhưng chưa có syncMs
    // và chưa gõ chữ nào). Sau 400ms hoặc khi có syncMs → gõ ngay.
    const waitingAudio = syncKey !== undefined && !syncMs && iRef.current === 0;
    const startDelay = waitingAudio ? 400 : 0;

    const tick = () => {
      if (timer.current) clearTimeout(timer.current);
      if (iRef.current >= wordsRef.current.length) {
        setShown(wordsRef.current.join(' '));
        return;
      }
      iRef.current += 1;
      setShown(wordsRef.current.slice(0, iRef.current).join(' '));
      timer.current = setTimeout(tick, cadence);
    };

    timer.current = setTimeout(tick, startDelay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text, syncMs, syncKey, baseCadence]);

  return shown;
}
```

- [ ] **Step 2: Select `audioCue` trong màn Meeting**

Trong `Demo4Meeting`, cạnh các `useStore` khác (Demo4Meeting.tsx:107–112) thêm:

```ts
  const audioCue = useStore((s) => s.audioCue);
```

- [ ] **Step 3: Tính cue cho hero và truyền vào `useReveal`**

Thay 2 dòng tính `typed`/`typing` (Demo4Meeting.tsx:185–186) bằng:

```ts
  // Hero chỉ khớp audio khi ĐANG NGHE lượt đối tác đã chốt (không phải khi mình
  // nói, và không trong lúc còn `live` preview dự đoán).
  const heroTurnId = !speaking && !live ? lastPeer?.id : undefined;
  const cue = audioCue && audioCue.turnId === heroTurnId ? audioCue : null;
  const typed = useReveal(heroBig, { syncMs: cue?.durationMs, syncKey: heroTurnId });
  const typing = typed.length < heroBig.length;
```

> `lastPeer` đã có sẵn (`useMemo` tại Demo4Meeting.tsx:178–181) và `TranslatorTurn` có `id`. Khi `speaking` hoặc còn `live`, `heroTurnId=undefined` ⇒ `syncKey=undefined` ⇒ không hoãn 400ms, gõ nhanh như cũ (đúng yêu cầu lời-mình không bị trễ).

- [ ] **Step 4: Gate — typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: zero error, không cảnh báo mới.

- [ ] **Step 5: Kiểm chứng runtime bằng tay (2 tab web)**

Chạy backend (mode `cloud` có key, hoặc để `edge` TTS mặc định để có audio thật) và `npm run web`; mở 2 tab localhost, ghép phòng (theo hướng dẫn test phòng họp).

Quan sát trên máy NGHE:
1. **Khớp:** đối tác nói câu dài → chữ hero bắt đầu gõ đúng lúc nghe tiếng, gõ xong gần lúc tiếng dứt.
2. **Preview vẫn chạy:** lúc đối tác giữ nút, chữ dự đoán chạy nhanh; thả nút → hero reset và gõ lại khớp audio.
3. **2 câu liên tiếp:** mỗi câu reset và gõ khớp audio của chính nó.
4. **Fallback tắt loa:** tắt `ttsOn` (Demo1/cài đặt) → không có `tts.audio` → sau ~400ms chữ vẫn gõ nhịp 55ms, không kẹt.
5. **Fallback web chưa tương tác:** tab mới chưa click vào trang → audio bị chặn → chữ vẫn hiện qua fallback.
6. **Mình nói:** giữ nút nói → hero (lời mình) gõ nhanh, không trễ 400ms.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/screens/rtt/Demo4Meeting.tsx
git commit -m "feat(meeting): hero caption reveal syncs to TTS audio via audioCue"
```

---

## Self-Review

**Spec coverage:**
- §Kiến trúc/1 `audioPlayback onStart` → Task 1. ✅
- §Kiến trúc/2 `audioCue` + reset points → Task 2 (Steps 1,4,5,6). ✅
- §Kiến trúc/3 `useReveal` syncMs/syncKey + fallback 400ms + chỉ áp lượt đối tác → Task 3 (Steps 1,3). ✅
- §Luồng dữ liệu người nghe → Task 2 Step 3–4 + Task 3 Step 3. ✅
- §Xử lý lỗi & biên: audio web bị chặn (Task 1 Step 2 catch + Task 3 fallback), wordCount=0 (Task 3 `words.length>0` guard), nhiều clip = clip đầu (Task 1 gọi onStart một-lần theo clip đang phát), syncKey đổi giữa chừng (Task 3 reset). ✅
- §Kiểm thử → Task 3 Step 5 (mục 1–6 ánh xạ đúng spec 1–7; typecheck/lint là gate mỗi task). ✅

**Placeholder scan:** không có TBD/TODO; mọi step có code/lệnh cụ thể. ✅

**Type consistency:** `AudioCue`/`audioCue` dùng nhất quán giữa Task 2 (khai) và Task 3 (đọc); `onStart(durationMs: number)` khớp giữa Task 1 (khai) và Task 2 (dùng); `syncMs`/`syncKey`/`cadence` khớp giữa Task 3 Step 1 (khai) và Step 3 (gọi); `lastPeerTurnId` là closure var chỉ trong slice (Task 2). ✅
