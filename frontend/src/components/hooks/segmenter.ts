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
