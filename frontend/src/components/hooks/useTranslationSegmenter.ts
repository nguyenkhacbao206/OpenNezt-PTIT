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
