/**
 * translatorSlice — state & điều phối phiên dịch real-time (contract streaming).
 *
 * Sở hữu một `TranslatorSocket`, nối sự kiện server vào state, cung cấp action
 * cho UI. Theo logic bản test chuẩn (backend hoang-dev, static/index.html):
 *
 *   - Đang nói: gửi `audio.partial` (cửa sổ audio tích luỹ) định kỳ →
 *     server trả `stt.partial` + `nmt.partial` (bản dịch TẠM, tự sửa) →
 *     cập nhật `live` tại chỗ.
 *   - Dừng nói: gửi `audio.chunk` (bản chốt) → `nmt.result` → chốt vào `turns`,
 *     `tts.audio` → phát giọng (edge-tts MP3).
 *
 * Vòng lặp thu âm + coalesce nằm ở tầng mic (Phase 2); slice chỉ forward `send`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateCreator } from 'zustand';

import { env } from '@/config/env';
import { TranslatorSocket } from '@/services';
import { playBase64Audio } from '@/services/audioPlayback';
import type {
  ConnectionStatus,
  Lang,
  ServerEvent,
  Speaker,
  TranslatorMode,
  TranslatorTurn,
  TurnMetrics,
} from '@/types/translator';
import type { RootStore } from '../index';

/** Dòng "đang nói" — bản dịch tạm cập nhật liên tục. */
export interface LiveLine {
  speaker: Speaker;
  srcText: string;
  dstText: string;
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Cài đặt lưu trên thiết bị (SRS: ngôn ngữ + backend nhớ giữa các lần mở).
const STORAGE_KEY = 'rtt.settings';
function persist(data: { wsUrl: string; srcLang: Lang; dstLang: Lang; ttsOn: boolean }): void {
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export interface TranslatorSlice {
  wsUrl: string;
  translatorStatus: ConnectionStatus;
  translatorMode: TranslatorMode;
  srcLang: Lang;
  dstLang: Lang;
  ttsOn: boolean;
  translatorError: string | null;

  /** Lịch sử: MỖI lượt nói (một lần push-to-talk) là MỘT entry đã gộp. */
  turns: TranslatorTurn[];
  /** Các segment đã cắt trong LƯỢT hiện tại (dùng cho card bên trái Demo6). */
  sessionSegments: TranslatorTurn[];
  /** Bong bóng "đang nói" hiện tại (từ stt.partial / nmt.partial), hoặc null. */
  live: LiveLine | null;
  metrics: TurnMetrics | null;
  /** Tăng mỗi khi một partial được phản hồi (nmt.partial/result/error) — dùng để
   *  mic coalesce: chỉ gửi cửa sổ kế tiếp khi cửa sổ trước đã có kết quả. */
  partialResponses: number;

  /** Nội bộ — KHÔNG select trong component. */
  _socket: TranslatorSocket | null;
  _direction: string | null;
  /** nmt.result kế tiếp là bản CHỐT của lượt → gộp sessionSegments vào lịch sử. */
  _finalizePending: boolean;

  /** Nạp cài đặt đã lưu (wsUrl, ngôn ngữ, tts) khi mở app. */
  hydrateSettings: () => Promise<void>;
  setWsUrl: (url: string) => void;
  setLangs: (src: Lang, dst: Lang) => void;
  setTranslatorMode: (mode: TranslatorMode) => void;
  setTtsOn: (on: boolean) => void;

  connect: () => void;
  disconnect: () => void;

  /** Mở một lượt nói mới (xoá live + segment cũ, đảm bảo đúng chiều dịch). */
  startTurn: (speaker: Speaker) => void;
  /** Gửi cửa sổ audio tích luỹ khi đang nói (bản dịch tạm sẽ về qua nmt.partial). */
  sendPartialAudio: (speaker: Speaker, wavBase64: string) => void;
  /** Chốt MỘT segment (cắt ở 4 dòng): audio.chunk → nmt.result → thêm vào sessionSegments. */
  commitSegment: (speaker: Speaker, wavBase64: string) => void;
  /** Kết thúc lượt (nhấn Dừng): audio.chunk cuối → gộp toàn bộ segment thành 1 entry lịch sử. */
  endTurn: (speaker: Speaker, wavBase64: string) => void;

  clearTurns: () => void;
}

export const createTranslatorSlice: StateCreator<RootStore, [], [], TranslatorSlice> = (
  set,
  get,
) => {
  const directionKey = () => {
    const s = get();
    return `${s.translatorMode}:${s.srcLang}->${s.dstLang}`;
  };

  /** Đảm bảo đã gửi session.start đúng chiều dịch hiện tại (gửi lại nếu đổi). */
  const ensureSession = (): void => {
    const s = get();
    if (!s._socket || !s._socket.isOpen) return;
    const dir = directionKey();
    if (s._direction !== dir) {
      s._socket.send({
        type: 'session.start',
        data: { mode: s.translatorMode, sourceLang: s.srcLang, targetLang: s.dstLang },
      });
      set({ _direction: dir });
    }
  };

  const handleEvent = (event: ServerEvent): void => {
    switch (event.type) {
      case 'session.started':
        set({ translatorMode: event.data.mode });
        break;
      case 'stt.partial': {
        const live = get().live;
        set({ live: { speaker: event.data.speaker, srcText: event.data.text, dstText: live?.dstText ?? '' } });
        break;
      }
      case 'nmt.partial':
        set({
          live: { speaker: event.data.speaker, srcText: event.data.srcText, dstText: event.data.dstText },
          partialResponses: get().partialResponses + 1,
        });
        break;
      case 'nmt.result': {
        const seg: TranslatorTurn = {
          id: makeId(),
          speaker: event.data.speaker,
          srcText: event.data.srcText,
          dstText: event.data.dstText,
        };
        const segs = [...get().sessionSegments, seg];
        if (get()._finalizePending) {
          // Chốt lượt: gộp toàn bộ segment thành MỘT entry lịch sử.
          const combined: TranslatorTurn = {
            id: makeId(),
            speaker: seg.speaker,
            srcText: segs.map((s) => s.srcText).join(' '),
            dstText: segs.map((s) => s.dstText).join(' '),
          };
          set({
            live: null,
            sessionSegments: [],
            _finalizePending: false,
            partialResponses: get().partialResponses + 1,
            turns: [...get().turns, combined],
          });
        } else {
          // Segment giữa chừng (do cắt 4 dòng): thêm vào card trái.
          set({
            live: null,
            sessionSegments: segs,
            partialResponses: get().partialResponses + 1,
          });
        }
        break;
      }
      case 'tts.audio':
        if (get().ttsOn) void playBase64Audio(event.data.audio);
        break;
      case 'metrics':
        set({ metrics: event.data });
        break;
      case 'error':
        set({
          live: null,
          partialResponses: get().partialResponses + 1,
          translatorError: `[${event.data.code}] ${event.data.message}`,
        });
        break;
      default:
        break;
    }
  };

  return {
    wsUrl: env.wsUrl,
    translatorStatus: 'disconnected',
    translatorMode: 'cloud',
    srcLang: 'vi',
    dstLang: 'en',
    ttsOn: true,
    translatorError: null,

    turns: [],
    sessionSegments: [],
    live: null,
    metrics: null,
    partialResponses: 0,

    _socket: null,
    _direction: null,
    _finalizePending: false,

    hydrateSettings: async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as Partial<{
          wsUrl: string;
          srcLang: Lang;
          dstLang: Lang;
          ttsOn: boolean;
        }>;
        set({
          wsUrl: saved.wsUrl ?? get().wsUrl,
          srcLang: saved.srcLang ?? get().srcLang,
          dstLang: saved.dstLang ?? get().dstLang,
          ttsOn: saved.ttsOn ?? get().ttsOn,
        });
      } catch {
        /* cài đặt lỗi -> dùng mặc định */
      }
    },
    setWsUrl: (url) => {
      set({ wsUrl: url });
      const s = get();
      persist({ wsUrl: url, srcLang: s.srcLang, dstLang: s.dstLang, ttsOn: s.ttsOn });
    },
    setLangs: (src, dst) => {
      set({ srcLang: src, dstLang: dst, _direction: null });
      const s = get();
      persist({ wsUrl: s.wsUrl, srcLang: src, dstLang: dst, ttsOn: s.ttsOn });
    },
    setTranslatorMode: (mode) => {
      set({ translatorMode: mode, _direction: null });
      const s = get();
      if (s._socket?.isOpen) s._socket.send({ type: 'config.update', data: { mode } });
    },
    setTtsOn: (on) => {
      set({ ttsOn: on });
      const s = get();
      if (s._socket?.isOpen) s._socket.send({ type: 'config.update', data: { ttsOn: on } });
      persist({ wsUrl: s.wsUrl, srcLang: s.srcLang, dstLang: s.dstLang, ttsOn: on });
    },

    connect: () => {
      const socket = new TranslatorSocket();
      set({ translatorStatus: 'connecting', translatorError: null, _socket: socket, _direction: null });
      socket.connect(get().wsUrl, {
        onOpen: () => {
          set({ translatorStatus: 'connected' });
          const s = get();
          socket.send({
            type: 'session.start',
            data: { mode: s.translatorMode, sourceLang: s.srcLang, targetLang: s.dstLang },
          });
          socket.send({ type: 'config.update', data: { ttsOn: s.ttsOn } });
          set({ _direction: directionKey() });
        },
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
      set({
        translatorStatus: 'disconnected',
        _socket: null,
        _direction: null,
        _finalizePending: false,
        live: null,
        sessionSegments: [],
      });
    },

    startTurn: (_speaker) => {
      ensureSession();
      set({ live: null, sessionSegments: [], _finalizePending: false, translatorError: null });
    },

    sendPartialAudio: (speaker, wavBase64) => {
      const { _socket } = get();
      if (!_socket || !_socket.isOpen) return;
      ensureSession();
      _socket.send({ type: 'audio.partial', data: { speaker, audio: wavBase64 } });
    },

    commitSegment: (speaker, wavBase64) => {
      const { _socket } = get();
      if (!_socket || !_socket.isOpen) return;
      ensureSession();
      _socket.send({ type: 'audio.chunk', data: { speaker, audio: wavBase64 } });
    },

    endTurn: (speaker, wavBase64) => {
      const { _socket } = get();
      if (!_socket || !_socket.isOpen) {
        set({ translatorError: 'Chưa kết nối tới backend. Bấm "Kết nối" trước.' });
        return;
      }
      ensureSession();
      set({ _finalizePending: true });
      _socket.send({ type: 'audio.chunk', data: { speaker, audio: wavBase64 } });
    },

    clearTurns: () => set({ turns: [], sessionSegments: [], live: null, metrics: null }),
  };
};
