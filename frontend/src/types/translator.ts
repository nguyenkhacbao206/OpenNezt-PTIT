/**
 * Kiểu dữ liệu cho tính năng phiên dịch real-time.
 *
 * Bám sát "Hợp đồng Message WebSocket" (SRS Mục 7) và handler backend:
 * mọi message đều là envelope `{ type, data }` theo cả hai chiều.
 */

/** Ngôn ngữ hỗ trợ. */
export type Lang = 'vi' | 'en';

/** Chế độ pipeline của backend. */
export type TranslatorMode = 'mock' | 'cloud' | 'offline';

/**
 * Phía nói (quy về màn hình split-screen):
 * - `vn` = đoàn Việt Nam (nói tiếng Việt, dịch sang Anh).
 * - `sg` = đối tác Singapore (nói tiếng Anh, dịch sang Việt).
 */
export type Speaker = 'vn' | 'sg';

/** Trạng thái kết nối WebSocket. */
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

/** Số liệu độ trễ cho Latency HUD. */
export interface TurnMetrics {
  sttMs: number;
  nmtMs: number;
  e2eMs: number;
}

/** Một lượt dịch đã hoàn tất (hiển thị trên panel của phía nói). */
export interface TranslatorTurn {
  id: string;
  speaker: Speaker;
  /** Câu gốc (ngôn ngữ của phía nói). */
  srcText: string;
  /** Bản dịch sang ngôn ngữ phía còn lại. */
  dstText: string;
}

/** Phụ đề tạm thời khi đang nói (streaming). */
export interface PartialLine {
  speaker: Speaker;
  /** Bản DỊCH tạm (ngôn ngữ đích) — hiện trực tiếp khi đang nói. */
  text: string;
  /** Câu nguồn nhận dạng được (nếu có). */
  srcText?: string;
}

// --------------------------------------------------------------------------
// Client -> Server
// --------------------------------------------------------------------------
export interface SessionStartMessage {
  type: 'session.start';
  data: { mode: TranslatorMode; sourceLang: Lang; targetLang: Lang };
}

export interface AudioChunkMessage {
  type: 'audio.chunk';
  /** `audio` là WAV 16kHz mono, mã hoá base64. */
  data: { speaker: Speaker; audio: string };
}

export interface AudioStreamMessage {
  type: 'audio.stream';
  /**
   * Chunk tạm khi ĐANG giữ mic: WAV 16kHz mono luỹ kế (accumulated-so-far),
   * mã hoá base64. Backend chỉ chạy STT và trả `stt.partial` (không NMT/TTS).
   */
  data: { speaker: Speaker; audio: string };
}

export interface ConfigUpdateMessage {
  type: 'config.update';
  data: { mode?: TranslatorMode; ttsOn?: boolean; glossaryId?: string };
}

export interface SessionEndMessage {
  type: 'session.end';
  data: Record<string, never>;
}

export type ClientMessage =
  | SessionStartMessage
  | AudioChunkMessage
  | AudioStreamMessage
  | ConfigUpdateMessage
  | SessionEndMessage;

// --------------------------------------------------------------------------
// Server -> Client
// --------------------------------------------------------------------------
export interface SessionStartedEvent {
  type: 'session.started';
  data: {
    mode: TranslatorMode;
    sourceLang: Lang;
    targetLang: Lang;
    ttsOn: boolean;
    glossaryId: string | null;
  };
}

export interface SttPartialEvent {
  type: 'stt.partial';
  data: { speaker: Speaker; text: string };
}

export interface SttFinalEvent {
  type: 'stt.final';
  data: { speaker: Speaker; text: string; lang: Lang };
}

export interface NmtPartialEvent {
  type: 'nmt.partial';
  /** Bản dịch tạm khi ĐANG nói (từ `audio.stream`) — chưa chốt lượt. */
  data: { speaker: Speaker; srcText: string; dstText: string };
}

export interface NmtResultEvent {
  type: 'nmt.result';
  data: { speaker: Speaker; srcText: string; dstText: string };
}

export interface TtsAudioEvent {
  type: 'tts.audio';
  data: { speaker: Speaker; audio: string };
}

export interface MetricsEvent {
  type: 'metrics';
  data: TurnMetrics;
}

export interface ConfigUpdatedEvent {
  type: 'config.updated';
  data: { mode: TranslatorMode; ttsOn: boolean; glossaryId: string | null };
}

export interface SessionEndedEvent {
  type: 'session.ended';
  data: Record<string, never>;
}

export interface ErrorEvent {
  type: 'error';
  data: { code: string; message: string; canFallback: boolean };
}

export type ServerEvent =
  | SessionStartedEvent
  | SttPartialEvent
  | SttFinalEvent
  | NmtPartialEvent
  | NmtResultEvent
  | TtsAudioEvent
  | MetricsEvent
  | ConfigUpdatedEvent
  | SessionEndedEvent
  | ErrorEvent;
