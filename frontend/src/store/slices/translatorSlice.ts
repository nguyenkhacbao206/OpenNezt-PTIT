/**
 * translatorSlice — state & điều phối cho phiên dịch real-time.
 *
 * Slice sở hữu một `TranslatorSocket`, nối các sự kiện server vào state, và
 * cung cấp action cho UI (connect / gửi lượt nói / đổi chế độ / kết thúc).
 * UI chỉ đọc state qua selector và gọi action — không đụng WebSocket trực tiếp.
 *
 * Khác bản web: `wsUrl` nằm trong state và chỉnh được từ UI, để test trên điện
 * thoại thật (nhập IP LAN của máy chủ) thay vì cố định trong biến môi trường.
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
} from '@/types/translator';
import { playBase64Wav } from '@/screens/Translator/audio';
import type { RootStore } from '../index';

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
  wsUrl: string;
  translatorStatus: ConnectionStatus;
  translatorMode: TranslatorMode;
  translatorError: string | null;
  turns: TranslatorTurn[];
  /**
   * Bong bóng "đang nói" của lượt hiện tại. Mỗi 3s ta gửi lại toàn bộ audio tích
   * luỹ → server trả transcript + bản dịch của CẢ câu đang lớn dần, cập nhật tại
   * chỗ (tự sửa). Khi bắt đầu lượt mới, liveTurn được chốt vào `turns`.
   */
  liveTurn: TranslatorTurn | null;
  partial: PartialLine | null;
  metrics: TurnMetrics | null;

  /** Nội bộ — KHÔNG select trong component. */
  _socket: TranslatorSocket | null;
  _direction: string | null;

  setWsUrl: (url: string) => void;
  connect: () => void;
  disconnect: () => void;
  setTranslatorMode: (mode: TranslatorMode) => void;
  /** Bắt đầu một lượt nói mới: chốt liveTurn cũ (nếu có) rồi mở bong bóng trống. */
  beginUtterance: (speaker: Speaker) => void;
  sendTurn: (speaker: Speaker, audioBase64: string) => void;
  clearTurns: () => void;
}

export const createTranslatorSlice: StateCreator<RootStore, [], [], TranslatorSlice> = (
  set,
  get,
) => {
  const handleEvent = (event: ServerEvent): void => {
    switch (event.type) {
      case 'session.started':
        set({ translatorMode: event.data.mode });
        break;
      case 'stt.partial': {
        // Hiện transcript sớm vào bong bóng đang nói (nếu đúng phía nói).
        const live = get().liveTurn;
        if (live && live.speaker === event.data.speaker) {
          set({ liveTurn: { ...live, srcText: event.data.text } });
        } else {
          set({ partial: { speaker: event.data.speaker, text: event.data.text } });
        }
        break;
      }
      case 'stt.final': {
        const live = get().liveTurn;
        if (live && live.speaker === event.data.speaker) {
          set({ liveTurn: { ...live, srcText: event.data.text } });
        }
        break;
      }
      case 'nmt.result': {
        const live = get().liveTurn;
        if (live && live.speaker === event.data.speaker) {
          // Cập nhật tại chỗ: transcript + bản dịch của cả câu đang lớn dần.
          set({
            partial: null,
            liveTurn: { ...live, srcText: event.data.srcText, dstText: event.data.dstText },
          });
        } else {
          // Không có bong bóng phù hợp → chốt thành một lượt độc lập.
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
        }
        break;
      }
      case 'tts.audio':
        void playBase64Wav(event.data.audio);
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

  /** Chốt liveTurn hiện tại (nếu có nội dung) vào lịch sử. */
  const commitLive = (): void => {
    const live = get().liveTurn;
    if (live && (live.srcText || live.dstText)) {
      set({ turns: [...get().turns, live], liveTurn: null });
    } else if (live) {
      set({ liveTurn: null });
    }
  };

  return {
    wsUrl: env.wsUrl,
    translatorStatus: 'disconnected',
    translatorMode: 'cloud',
    translatorError: null,
    turns: [],
    liveTurn: null,
    partial: null,
    metrics: null,
    _socket: null,
    _direction: null,

    setWsUrl: (url) => set({ wsUrl: url }),

    beginUtterance: (speaker) => {
      commitLive(); // chốt bong bóng của lượt trước
      set({ liveTurn: { id: makeId(), speaker, srcText: '', dstText: '' } });
    },

    connect: () => {
      const socket = new TranslatorSocket();
      set({
        translatorStatus: 'connecting',
        translatorError: null,
        _socket: socket,
        _direction: null,
      });
      socket.connect(get().wsUrl, {
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
      commitLive();
      set({ translatorStatus: 'disconnected', _socket: null, _direction: null });
    },

    setTranslatorMode: (mode) => {
      // Đặt _direction = null để lượt kế tiếp gửi lại session.start kèm mode mới.
      set({ translatorMode: mode, _direction: null });
    },

    sendTurn: (speaker, audioBase64) => {
      const { _socket, translatorMode, _direction } = get();
      if (!_socket || !_socket.isOpen) {
        set({ translatorError: 'Chưa kết nối tới backend. Bấm "Kết nối" trước.' });
        return;
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
      set({ translatorError: null });
      _socket.send({ type: 'audio.chunk', data: { speaker, audio: audioBase64 } });
    },

    clearTurns: () => set({ turns: [], liveTurn: null, partial: null, metrics: null }),
  };
};
