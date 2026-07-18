/**
 * useMeetingMic — thu âm push-to-talk streaming, ĐA NỀN TẢNG.
 *
 *   - Web/Desktop (Expo Web, Electron): dùng Web Audio API (WebMicRecorder) →
 *     WAV 16k thật, cửa sổ tích luỹ đọc bất kỳ lúc nào (không khoảng hở).
 *   - iOS: expo-audio LINEARPCM → WAV 16k; cộng dồn PCM qua từng đoạn (stop/read
 *     /restart mỗi nhịp).
 *   - Android: expo-audio (định dạng nén) — Groq nhận được nhiều format; WAV chuẩn
 *     thì nên dùng web/iOS.
 *
 * Chung một logic: mỗi ~2.5s gửi cửa sổ audio tích luỹ dạng `audio.partial` (có
 * coalesce theo `partialResponses`); dừng → `audio.chunk`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { AudioModule, setAudioModeAsync, useAudioRecorder } from 'expo-audio';

import {
  WAV_16K,
  base64ToBytes,
  bytesToBase64,
  concatPcm,
  pcmToWav,
  readFileBase64,
  wavToPcm,
} from '@/services/audioCapture';
import { WebMicRecorder } from '@/services/webAudioCapture';
import { useStore } from '@/store';
import type { Speaker } from '@/types/translator';

const SEGMENT_MS = 2500;
const COALESCE_TIMEOUT = 8000;
const IS_WEB = Platform.OS === 'web';

export interface MeetingMic {
  recording: boolean;
  error: string | null;
  start: (speaker: Speaker) => Promise<void>;
  /** Chốt segment hiện tại (audio.chunk → một turn) rồi thu tiếp segment mới. */
  cut: () => Promise<void>;
  stop: () => Promise<void>;
}

export function useMeetingMic(): MeetingMic {
  const recorder = useAudioRecorder(WAV_16K); // dùng cho native
  const startTurn = useStore((s) => s.startTurn);
  const sendPartialAudio = useStore((s) => s.sendPartialAudio);
  const commitSegment = useStore((s) => s.commitSegment);
  const endTurn = useStore((s) => s.endTurn);
  const partialResponses = useStore((s) => s.partialResponses);

  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liveRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speakerRef = useRef<Speaker>('vn');
  const awaitingRef = useRef(false);
  const lastAtRef = useRef(0);

  // Web recorder (Web Audio API).
  const webRef = useRef<WebMicRecorder | null>(null);
  // Native: PCM tích luỹ + xâu chuỗi thao tác recorder.
  const pcmChunksRef = useRef<Uint8Array[]>([]);
  const opChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    awaitingRef.current = false;
  }, [partialResponses]);

  const runExclusive = useCallback((fn: () => Promise<void>): Promise<void> => {
    opChainRef.current = opChainRef.current.then(fn, fn);
    return opChainRef.current;
  }, []);

  // --- Native: cắt đoạn, đọc PCM, cộng dồn, thu tiếp ------------------------
  const flushNative = useCallback(
    (restart: boolean) =>
      runExclusive(async () => {
        try {
          await recorder.stop();
        } catch {
          return;
        }
        const uri = recorder.uri;
        if (uri) {
          try {
            const b64 = await readFileBase64(uri);
            const pcm = wavToPcm(base64ToBytes(b64));
            if (pcm.length > 0) pcmChunksRef.current.push(pcm);
          } catch {
            /* bỏ qua lỗi đọc một đoạn */
          }
        }
        if (restart && liveRef.current) {
          try {
            await recorder.prepareToRecordAsync();
            recorder.record();
          } catch (err: any) {
            setError('Ghi âm đoạn tiếp theo thất bại: ' + (err?.message ?? String(err)));
          }
        }
      }),
    [recorder, runExclusive],
  );

  /** Cửa sổ audio tích luỹ hiện tại (WAV base64) — theo nền tảng. */
  const buildWindow = useCallback(async (): Promise<string | null> => {
    if (IS_WEB) return webRef.current?.windowWav() ?? null;
    await flushNative(true);
    if (pcmChunksRef.current.length === 0) return null;
    return bytesToBase64(pcmToWav(concatPcm(pcmChunksRef.current)));
  }, [flushNative]);

  const onTick = useCallback(async () => {
    if (!liveRef.current) return;
    if (awaitingRef.current && Date.now() - lastAtRef.current < COALESCE_TIMEOUT) return;
    const wav = await buildWindow();
    if (!wav) return;
    awaitingRef.current = true;
    lastAtRef.current = Date.now();
    sendPartialAudio(speakerRef.current, wav);
  }, [buildWindow, sendPartialAudio]);

  const start = useCallback(
    async (speaker: Speaker): Promise<void> => {
      setError(null);
      try {
        if (IS_WEB) {
          webRef.current = new WebMicRecorder();
          await webRef.current.start(); // getUserMedia tự xin quyền
        } else {
          const perm = await AudioModule.requestRecordingPermissionsAsync();
          if (!perm.granted) {
            setError('Không có quyền micro. Kiểm tra cài đặt quyền của app.');
            return;
          }
          await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
          pcmChunksRef.current = [];
          await recorder.prepareToRecordAsync();
          recorder.record();
        }
        awaitingRef.current = false;
        speakerRef.current = speaker;
        startTurn(speaker);
        liveRef.current = true;
        setRecording(true);
        timerRef.current = setInterval(() => void onTick(), SEGMENT_MS);
      } catch (err: any) {
        liveRef.current = false;
        setError('Không truy cập được micro: ' + (err?.message ?? String(err)));
      }
    },
    [recorder, startTurn, onTick],
  );

  const cut = useCallback(async (): Promise<void> => {
    if (!liveRef.current) return;
    let wav: string | null = null;
    if (IS_WEB) {
      wav = webRef.current?.windowWav() ?? null;
      webRef.current?.reset();
    } else {
      await flushNative(true); // đọc đoạn cuối + thu tiếp segment mới
      if (pcmChunksRef.current.length > 0) {
        wav = bytesToBase64(pcmToWav(concatPcm(pcmChunksRef.current)));
      }
      pcmChunksRef.current = [];
    }
    awaitingRef.current = false;
    if (wav) commitSegment(speakerRef.current, wav);
  }, [flushNative, commitSegment]);

  const stop = useCallback(async (): Promise<void> => {
    if (!liveRef.current) return;
    liveRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);

    let finalWav: string | null = null;
    if (IS_WEB) {
      finalWav = (await webRef.current?.stop()) ?? null;
      webRef.current = null;
    } else {
      await flushNative(false);
      if (pcmChunksRef.current.length > 0) {
        finalWav = bytesToBase64(pcmToWav(concatPcm(pcmChunksRef.current)));
      }
    }
    if (finalWav) endTurn(speakerRef.current, finalWav);
  }, [flushNative, endTurn]);

  // Dọn khi rời màn hình.
  useEffect(
    () => () => {
      liveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (IS_WEB) void webRef.current?.stop();
      else recorder.stop().catch(() => undefined);
    },
    [recorder],
  );

  return { recording, error, start, cut, stop };
}
