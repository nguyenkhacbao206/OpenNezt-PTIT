/**
 * TranslatorScreen — trợ lý phiên dịch song ngữ Việt ⇄ Anh real-time (bản app).
 *
 * Bố cục Split-Screen theo SRS (bám sát bản web): panel Singapore (English) và
 * panel Việt Nam (Tiếng Việt), mỗi bên có nút Push-to-Talk riêng. Ghi âm ra WAV
 * 16kHz mono (xem ./audio) rồi gửi `audio.chunk`; backend chạy mode `cloud`
 * (Groq) sẽ trả transcript + bản dịch thật qua WebSocket.
 *
 * Toàn bộ state & vòng đời WebSocket nằm ở store (translatorSlice); màn hình chỉ
 * đọc state qua selector, gọi action, và lo phần ghi âm (cần hook của Expo).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  AudioModule,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';

import { SafeAreaWrapper } from '@/components/layout';
import { colors } from '@/config/theme';
import { useStore } from '@/store';
import type { ConnectionStatus, Speaker, TranslatorTurn } from '@/types/translator';
import {
  WAV_16K,
  base64ToBytes,
  bytesToBase64,
  concatPcm,
  pcmToWav,
  readFileBase64,
  wavToPcm,
} from './audio';

interface SideConfig {
  speaker: Speaker;
  title: string;
  spokenLabel: string;
  translatedLabel: string;
  panelBg: string;
  accent: string;
}

const SG_SIDE: SideConfig = {
  speaker: 'sg',
  title: '🇸🇬 Đối tác Singapore (English)',
  spokenLabel: 'English',
  translatedLabel: 'Tiếng Việt',
  panelBg: '#eff6ff', // blue-50
  accent: '#2563eb',
};

const VN_SIDE: SideConfig = {
  speaker: 'vn',
  title: '🇻🇳 Đoàn Việt Nam (Tiếng Việt)',
  spokenLabel: 'Tiếng Việt',
  translatedLabel: 'English',
  panelBg: '#ecfdf5', // emerald-50
  accent: '#059669',
};

/**
 * Nhịp cập nhật (ms): mỗi nhịp gửi lại TOÀN BỘ audio tích luỹ từ đầu lượt để
 * server phiên âm + dịch lại cả câu đang lớn dần (transcript hiện thêm, bản dịch
 * tự sửa). Nhỏ hơn = mượt/realtime hơn nhưng tốn quota + băng thông hơn.
 */
const SEGMENT_MS = 3000;

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  disconnected: 'Đã ngắt',
  connecting: 'Đang kết nối…',
  connected: 'Đã kết nối',
  error: 'Lỗi kết nối',
};
const STATUS_COLOR: Record<ConnectionStatus, string> = {
  disconnected: colors.muted,
  connecting: colors.warning,
  connected: colors.success,
  error: colors.danger,
};

export function TranslatorScreen() {
  const status = useStore((s) => s.translatorStatus);
  const mode = useStore((s) => s.translatorMode);
  const error = useStore((s) => s.translatorError);
  const turns = useStore((s) => s.turns);
  const liveTurn = useStore((s) => s.liveTurn);
  const metrics = useStore((s) => s.metrics);
  const wsUrl = useStore((s) => s.wsUrl);

  const setWsUrl = useStore((s) => s.setWsUrl);
  const connect = useStore((s) => s.connect);
  const disconnect = useStore((s) => s.disconnect);
  const setMode = useStore((s) => s.setTranslatorMode);
  const beginUtterance = useStore((s) => s.beginUtterance);
  const sendTurn = useStore((s) => s.sendTurn);
  const clearTurns = useStore((s) => s.clearTurns);

  const recorder = useAudioRecorder(WAV_16K);
  const [activeSpeaker, setActiveSpeaker] = useState<Speaker | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  // Điều khiển vòng lặp cập nhật mỗi SEGMENT_MS.
  const liveRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // PCM tích luỹ của lượt hiện tại (mỗi phần tử là dữ liệu của một đoạn 3s).
  const pcmChunksRef = useRef<Uint8Array[]>([]);
  // Nối tiếp thao tác trên recorder để không stop/record chồng chéo nhau.
  const opChainRef = useRef<Promise<void>>(Promise.resolve());

  const runExclusive = useCallback((fn: () => Promise<void>): Promise<void> => {
    opChainRef.current = opChainRef.current.then(fn, fn);
    return opChainRef.current;
  }, []);

  /**
   * Cắt đoạn hiện tại: đọc WAV vừa thu → lấy PCM → cộng dồn → gói lại thành 1 WAV
   * lớn dần → gửi. Nhờ gửi TOÀN BỘ audio tích luỹ, server dịch lại cả câu (tự
   * sửa). `restart` = còn tiếp tục thu đoạn kế.
   */
  const flushSegment = useCallback(
    (speaker: Speaker, restart: boolean) =>
      runExclusive(async () => {
        try {
          await recorder.stop();
        } catch {
          return; // không ở trạng thái đang thu — bỏ qua
        }
        const uri = recorder.uri;
        if (uri) {
          try {
            const segB64 = await readFileBase64(uri);
            if (segB64) {
              const pcm = wavToPcm(base64ToBytes(segB64));
              if (pcm.length > 0) pcmChunksRef.current.push(pcm);
              if (pcmChunksRef.current.length > 0) {
                const fullWav = pcmToWav(concatPcm(pcmChunksRef.current));
                sendTurn(speaker, bytesToBase64(fullWav));
              }
            }
          } catch {
            /* bỏ qua lỗi xử lý audio của một đoạn */
          }
        }
        if (restart && liveRef.current) {
          try {
            await recorder.prepareToRecordAsync();
            recorder.record();
          } catch (err: any) {
            setMicError('Ghi âm đoạn tiếp theo thất bại: ' + (err?.message ?? String(err)));
          }
        }
      }),
    [recorder, runExclusive, sendTurn],
  );

  const stopLive = useCallback(
    (speaker: Speaker) => {
      liveRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setActiveSpeaker(null);
      void flushSegment(speaker, false); // gửi nốt phần audio cuối
    },
    [flushSegment],
  );

  const startLive = useCallback(
    async (speaker: Speaker): Promise<void> => {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) {
          setMicError('Không có quyền micro. Kiểm tra cài đặt quyền của app.');
          return;
        }
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
        pcmChunksRef.current = [];
        beginUtterance(speaker); // mở bong bóng "đang nói" mới
        liveRef.current = true;
        await recorder.prepareToRecordAsync();
        recorder.record();
        setActiveSpeaker(speaker);
        // Mỗi SEGMENT_MS: cắt & gửi lại toàn bộ audio tích luỹ (cập nhật tại chỗ).
        timerRef.current = setInterval(() => {
          if (liveRef.current) void flushSegment(speaker, true);
        }, SEGMENT_MS);
      } catch (err: any) {
        liveRef.current = false;
        setMicError('Không truy cập được micro: ' + (err?.message ?? String(err)));
      }
    },
    [recorder, flushSegment, beginUtterance],
  );

  const handleTalk = useCallback(
    (speaker: Speaker): void => {
      setMicError(null);
      if (activeSpeaker === speaker) {
        stopLive(speaker);
      } else if (activeSpeaker === null) {
        void startLive(speaker);
      }
    },
    [activeSpeaker, startLive, stopLive],
  );

  // Tự đóng phiên + dừng thu khi rời màn hình (zero-retention).
  useEffect(
    () => () => {
      liveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      recorder.stop().catch(() => undefined);
      disconnect();
    },
    [disconnect, recorder],
  );

  const isConnected = status === 'connected';
  const fmt = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v)}ms`);

  return (
    <SafeAreaWrapper edges={['bottom']}>
      <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 12, gap: 12 }}>
        {/* Thanh điều khiển */}
        <View className="rounded-xl border border-gray-200 bg-white p-3" style={{ gap: 10 }}>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <View
                className="mr-1.5 h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: STATUS_COLOR[status] }}
              />
              <Text className="text-sm font-medium text-gray-700">{STATUS_LABEL[status]}</Text>
            </View>
            <ModeToggle mode={mode} onChange={setMode} disabled={isConnected} />
          </View>

          {/* Latency HUD */}
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <Text className="text-xs text-gray-500">STT {fmt(metrics?.sttMs)}</Text>
            <Text className="text-xs text-gray-500">NMT {fmt(metrics?.nmtMs)}</Text>
            <Text className="text-xs font-semibold text-gray-700">E2E {fmt(metrics?.e2eMs)}</Text>
          </View>

          {/* Backend WS URL + kết nối */}
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <TextInput
              value={wsUrl}
              onChangeText={setWsUrl}
              editable={!isConnected}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="ws://192.168.1.x:8000/ws"
              placeholderTextColor={colors.muted}
              className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900"
              style={{ opacity: isConnected ? 0.5 : 1 }}
            />
            {isConnected ? (
              <Pressable
                onPress={disconnect}
                className="rounded-lg px-3 py-1.5"
                style={{ backgroundColor: colors.danger }}
              >
                <Text className="text-xs font-semibold text-white">Ngắt</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={connect}
                className="rounded-lg px-3 py-1.5"
                style={{ backgroundColor: colors.primary }}
              >
                <Text className="text-xs font-semibold text-white">
                  {status === 'connecting' ? '…' : 'Kết nối'}
                </Text>
              </Pressable>
            )}
            <Pressable onPress={clearTurns} className="rounded-lg border border-gray-300 px-3 py-1.5">
              <Text className="text-xs font-medium text-gray-600">Xoá</Text>
            </Pressable>
          </View>
        </View>

        {(error || micError) && (
          <View
            className="rounded-lg px-3 py-2"
            style={{ backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca' }}
          >
            <Text className="text-sm" style={{ color: colors.danger }}>
              {micError ?? error}
            </Text>
          </View>
        )}

        {/* Split-screen */}
        <Panel
          side={SG_SIDE}
          turns={turns}
          liveTurn={liveTurn?.speaker === 'sg' ? liveTurn : null}
          isRecording={activeSpeaker === 'sg'}
          disabled={!isConnected || (activeSpeaker !== null && activeSpeaker !== 'sg')}
          onTalk={() => void handleTalk('sg')}
        />
        <Panel
          side={VN_SIDE}
          turns={turns}
          liveTurn={liveTurn?.speaker === 'vn' ? liveTurn : null}
          isRecording={activeSpeaker === 'vn'}
          disabled={!isConnected || (activeSpeaker !== null && activeSpeaker !== 'vn')}
          onTalk={() => void handleTalk('vn')}
        />

        <Text className="text-[11px] text-muted">
          Ghi âm WAV 16kHz mono (iOS) → gửi backend. Dịch thật cần backend chạy mode Cloud + GROQ key.
        </Text>
      </ScrollView>
    </SafeAreaWrapper>
  );
}

function ModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: string;
  onChange: (mode: 'cloud' | 'mock') => void;
  disabled?: boolean;
}) {
  const next = mode === 'cloud' ? 'mock' : 'cloud';
  return (
    <Pressable
      onPress={() => onChange(next)}
      disabled={disabled}
      className="rounded-md border border-gray-300 px-2.5 py-1"
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Text className="text-xs font-medium text-gray-600">
        Chế độ: {mode === 'cloud' ? 'Cloud (Groq)' : mode === 'mock' ? 'Mock' : mode}
      </Text>
    </Pressable>
  );
}

interface PanelProps {
  side: SideConfig;
  turns: TranslatorTurn[];
  /** Bong bóng "đang nói" của phía này (cập nhật tại chỗ), hoặc null. */
  liveTurn: TranslatorTurn | null;
  isRecording: boolean;
  disabled: boolean;
  onTalk: () => void;
}

function TurnBubble({
  side,
  turn,
  live,
  isRecording,
}: {
  side: SideConfig;
  turn: TranslatorTurn;
  live?: boolean;
  isRecording?: boolean;
}) {
  const hasContent = Boolean(turn.srcText || turn.dstText);
  return (
    <View
      className={live ? 'rounded-lg border border-dashed p-3' : 'rounded-lg bg-white/70 p-3'}
      style={live ? { borderColor: side.accent, backgroundColor: '#ffffffcc' } : undefined}
    >
      <Text className="text-[11px] uppercase tracking-wide text-gray-400">{side.spokenLabel}</Text>
      <Text className="text-gray-800">
        {turn.srcText || (isRecording ? '🎙 Đang nghe…' : '…')}
      </Text>
      {(turn.dstText || (live && hasContent)) && (
        <>
          <Text className="mt-1 text-[11px] uppercase tracking-wide text-gray-400">
            {side.translatedLabel}
          </Text>
          <Text className="font-medium" style={{ color: side.accent }}>
            {turn.dstText || '…'}
          </Text>
        </>
      )}
    </View>
  );
}

function Panel({ side, turns, liveTurn, isRecording, disabled, onTalk }: PanelProps) {
  const own = turns.filter((t) => t.speaker === side.speaker);
  return (
    <View
      className="rounded-xl border border-gray-200 p-4"
      style={{ backgroundColor: side.panelBg, gap: 12, minHeight: 200 }}
    >
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 pr-2 text-sm font-semibold text-gray-800">{side.title}</Text>
        <Pressable
          onPress={onTalk}
          disabled={disabled}
          className="rounded-lg px-3 py-2"
          style={{
            backgroundColor: disabled ? colors.border : isRecording ? colors.danger : side.accent,
          }}
        >
          <Text className="text-xs font-semibold text-white">
            {isRecording ? '🔴 Đang nghe · chạm để dừng' : '● Nhấn để nói'}
          </Text>
        </Pressable>
      </View>

      <View style={{ gap: 8 }}>
        {own.length === 0 && !liveTurn && (
          <Text className="text-sm text-gray-400">Chưa có lượt nói nào.</Text>
        )}
        {own.map((turn) => (
          <TurnBubble key={turn.id} side={side} turn={turn} />
        ))}
        {liveTurn && (
          <TurnBubble side={side} turn={liveTurn} live isRecording={isRecording} />
        )}
      </View>
    </View>
  );
}
