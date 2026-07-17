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
  partial: PartialLine | null;
  metrics: TurnMetrics | null;

  /** Nội bộ — KHÔNG select trong component. */
  _socket: TranslatorSocket | null;
  _direction: string | null;

  connect: () => void;
  disconnect: () => void;
  setTranslatorMode: (mode: TranslatorMode) => void;
  /** Gửi chunk tạm khi ĐANG giữ mic → hiện transcript nguồn real-time. */
  streamPartial: (speaker: Speaker, audioBase64: string) => void;
  /** Chốt lượt nói khi THẢ mic → chạy full STT→NMT→TTS. */
  sendTurn: (speaker: Speaker, audioBase64: string) => void;
  clearTurns: () => void;
}

export const createTranslatorSlice: StateCreator<
  AppStore,
  [],
  [],
  TranslatorSlice
> = (set, get) => {
  const handleEvent = (event: ServerEvent): void => {
    switch (event.type) {
      case 'session.started':
        set({ translatorMode: event.data.mode });
        break;
      case 'stt.partial':
        set({ partial: { speaker: event.data.speaker, text: event.data.text } });
        break;
      case 'nmt.partial':
        // Preview khi đang nói: hiện bản DỊCH trực tiếp (kèm câu nguồn).
        set({
          partial: {
            speaker: event.data.speaker,
            text: event.data.dstText,
            srcText: event.data.srcText,
          },
        });
        break;
      case 'nmt.result':
        set({
          partial: null,
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
          partial: null,
          translatorError: `[${event.data.code}] ${event.data.message}`,
        });
        break;
      default:
        break;
    }
  };

  /**
   * Đảm bảo đã gửi `session.start` đúng mode/hướng cho `speaker`. Trả về false
   * nếu chưa kết nối (kèm set lỗi). Dùng chung cho streamPartial & sendTurn.
   */
  const ensureSession = (speaker: Speaker): boolean => {
    const { _socket, translatorMode, _direction } = get();
    if (!_socket || !_socket.isOpen) {
      set({ translatorError: 'Chưa kết nối tới backend. Bấm "Kết nối" trước.' });
      return false;
    }
    const { source, target } = directionFor(speaker);
    const dir = `${translatorMode}:${source}->${target}`;
    if (_direction !== dir) {
      _socket.send({
        type: 'session.start',
        data: { mode: translatorMode, sourceLang: source, targetLang: target },
      });
      set({ _direction: dir });
    }
    return true;
  };

  return {
    translatorStatus: 'disconnected',
    translatorMode: 'cloud',
    translatorError: null,
    turns: [],
    partial: null,
    metrics: null,
    _socket: null,
    _direction: null,

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
      set({ translatorStatus: 'disconnected', _socket: null, _direction: null });
    },

    setTranslatorMode: (mode) => {
      // Đặt _direction = null để lượt kế tiếp gửi lại session.start kèm mode mới.
      set({ translatorMode: mode, _direction: null });
    },

    streamPartial: (speaker, audioBase64) => {
      if (!ensureSession(speaker)) return;
      // Không set partial ở đây: `stt.partial` từ server sẽ cập nhật text thật.
      get()._socket?.send({ type: 'audio.stream', data: { speaker, audio: audioBase64 } });
    },

    sendTurn: (speaker, audioBase64) => {
      if (!ensureSession(speaker)) return;
      // Giữ nguyên transcript live đang hiện cho tới khi `nmt.result` về.
      set({ translatorError: null });
      get()._socket?.send({ type: 'audio.chunk', data: { speaker, audio: audioBase64 } });
    },

    clearTurns: () => set({ turns: [], partial: null, metrics: null }),
  };
};
