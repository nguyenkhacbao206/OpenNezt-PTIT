/** Barrel export cho custom hooks dùng chung. */
export { useAuth } from './useAuth';
export { useTheme } from './useTheme';
export { useDebounce } from './useDebounce';
export { useMic } from './useMic';
export type { UseMic } from './useMic';
export { useWordReveal } from './useWordReveal';
export { useSpeechRecognition } from './useSpeechRecognition';
export type { UseSpeechRecognition } from './useSpeechRecognition';
export { useTranslationSegmenter } from './useTranslationSegmenter';
export {
  decideSegment,
  initSegmenterState,
  THRESHOLD_MS,
  THRESHOLD_WORDS,
} from './segmenter';
export type { SegmenterState, SegmentDecision } from './segmenter';
