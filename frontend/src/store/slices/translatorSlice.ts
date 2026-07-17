/**
 * translatorSlice — state & điều phối cho phiên dịch real-time.
 *
 * Slice sở hữu một `TranslatorSocket`, nối các sự kiện server vào state, và
 * cung cấp action cho UI (connect / gửi lượt nói / đổi chế độ / kết thúc).
 * UI chỉ đọc state qua selector và gọi action — không đụng WebSocket trực tiếp.
 */
import type { StateCreator } from 'zustand';
import { TranslatorSocket } from '@/services';
import { env } from '@/config/env';
import type {
  ConnectionStatus,
  Lang,
  PartialLine,
  ServerEvent,
  Speaker,
  TranslatorMode,
  TranslatorTurn,
  TurnMetrics,
} from '@/types';
import type { AppStore } from '../index';

/** Ngôn ngữ nguồn/đích theo phía nói. */
function directionFor(speaker: Speaker): { source: Lang; target: Lang } {
  return speaker === 'vn'
    ? { source: 'vi', target: 'en' }
    : { source: 'en', target: 'vi' };
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export interface TranslatorSlice {
  translatorStatus: ConnectionStatus;
  translatorMode: TranslatorMode;
  translatorError: string | null;
  turns: TranslatorTurn[];
  /** Transcript gốc tạm thời (hiện dần khi đang nói). */
  liveOriginal: PartialLine | null;
  /** Bản dịch của phần đã nói (hiện ngay khi đang nói, chưa chốt). */
  liveTranslation: PartialLine | null;
  /** Có một audio.partial đang chờ phản hồi (để coalesce, tránh dồn call Groq). */
  awaitingPartial: boolean;
  metrics: TurnMetrics | null;

  /** Nội bộ — KHÔNG select trong component. */
  _socket: TranslatorSocket | null;
  _direction: string | null;
  /** Mốc gửi audio.partial gần nhất (ms) — dùng cho stale timeout. */
  _lastPartialAt: number;

  connect: () => void;
  disconnect: () => void;
  setTranslatorMode: (mode: TranslatorMode) => void;
  /** Gửi cửa sổ audio đang nói -> nhận transcript gốc + bản dịch phần đã nói. */
  sendPartial: (speaker: Speaker, audioBase64: string) => void;
  /** Chốt lượt nói khi dứt câu -> bản dịch chính thức. */
  sendTurn: (speaker: Speaker, audioBase64: string) => void;
  /** Gửi đoạn text chưa chốt (Web Speech) -> dịch xem trước. */
  sendTextPartial: (speaker: Speaker, text: string) => void;
  /** Gửi đoạn text đã chốt -> dịch chính thức (nmt.result). */
  sendTextFinal: (speaker: Speaker, text: string) => void;
  /** Đặt phụ đề gốc cục bộ (từ Web Speech, Cloud mode); null để xoá. */
  setCaption: (speaker: Speaker, text: string | null) => void;
  clearTurns: () => void;
}

export const createTranslatorSlice: StateCreator<
  AppStore,
  [],
  [],
  TranslatorSlice
> = (set, get) => {
  /**
   * Đảm bảo phiên đang ở đúng chiều dịch cho `speaker` trước khi gửi audio.
   * Trả về socket đang mở, hoặc null (kèm set lỗi) nếu chưa kết nối.
   */
  const ensureDirection = (speaker: Speaker): TranslatorSocket | null => {
    const { _socket, translatorMode, _direction } = get();
    if (!_socket || !_socket.isOpen) {
      set({ translatorError: 'Chưa kết nối tới backend. Bấm "Kết nối" trước.' });
      return null;
    }
    const { source, target } = directionFor(speaker);
    const dir = `${translatorMode}:${source}->${target}`;
    if (_direction !== dir) {
      _socket.send({
        type: 'session.start',
        data: { mode: translatorMode, sourceLang: source, targetLang: target },
      });
      set({ _direction: dir, translatorError: null });
    }
    return _socket;
  };

  const handleEvent = (event: ServerEvent): void => {
    switch (event.type) {
      case 'session.started':
        set({ translatorMode: event.data.mode });
        break;
      case 'stt.partial':
        set({ liveOriginal: { speaker: event.data.speaker, text: event.data.text } });
        break;
      case 'nmt.partial':
        // Bản dịch phần đã nói — hiện ngay ở panel bên kia, chưa chốt.
        // Đồng thời gỡ cờ chờ để tick sau được phép gửi partial mới (coalesce).
        set({
          liveTranslation: { speaker: event.data.speaker, text: event.data.dstText },
          awaitingPartial: false,
        });
        break;
      case 'nmt.result':
        // Bản chốt — đưa vào hội thoại và xoá các bản tạm.
        set({
          liveOriginal: null,
          liveTranslation: null,
          awaitingPartial: false,
          turns: [
            ...get().turns,
            {
              id: makeId(),
              speaker: event.data.speaker,
              srcText: event.data.srcText,
              dstText: event.data.dstText,
            },
          ],
        });
        break;
      case 'metrics':
        set({ metrics: event.data });
        break;
      case 'error':
        set({
          liveOriginal: null,
          liveTranslation: null,
          awaitingPartial: false,
          translatorError: `[${event.data.code}] ${event.data.message}`,
        });
        break;
      default:
        break;
    }
  };

  return {
    translatorStatus: 'disconnected',
    translatorMode: 'cloud',
    translatorError: null,
    turns: [],
    liveOriginal: null,
    liveTranslation: null,
    awaitingPartial: false,
    metrics: null,
    _socket: null,
    _direction: null,
    _lastPartialAt: 0,

    connect: () => {
      const socket = new TranslatorSocket();
      set({ translatorStatus: 'connecting', translatorError: null, _socket: socket, _direction: null });
      socket.connect(env.wsUrl, {
        onOpen: () => set({ translatorStatus: 'connected' }),
        onEvent: handleEvent,
        onClose: () => set({ translatorStatus: 'disconnected', _direction: null }),
        onError: () =>
          set({ translatorStatus: 'error', translatorError: 'Lỗi kết nối WebSocket tới backend.' }),
      });
    },

    disconnect: () => {
      const { _socket } = get();
      if (_socket) {
        _socket.send({ type: 'session.end', data: {} });
        _socket.close();
      }
      set({ translatorStatus: 'disconnected', _socket: null, _direction: null, awaitingPartial: false });
    },

    setTranslatorMode: (mode) => {
      // Đặt _direction = null để lượt kế tiếp gửi lại session.start kèm mode mới.
      set({ translatorMode: mode, _direction: null });
    },

    sendPartial: (speaker, audioBase64) => {
      const socket = ensureDirection(speaker);
      if (!socket) return;
      socket.send({ type: 'audio.partial', data: { speaker, audio: audioBase64 } });
      // Đánh dấu đang chờ phản hồi -> tick sau bị coalesce cho tới khi nmt.* về.
      set({ awaitingPartial: true, _lastPartialAt: Date.now() });
    },

    sendTurn: (speaker, audioBase64) => {
      const socket = ensureDirection(speaker);
      if (!socket) return;
      socket.send({ type: 'audio.chunk', data: { speaker, audio: audioBase64 } });
    },

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

    clearTurns: () =>
      set({
        turns: [],
        liveOriginal: null,
        liveTranslation: null,
        awaitingPartial: false,
        metrics: null,
      }),
  };
};
