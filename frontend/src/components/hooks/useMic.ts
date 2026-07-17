/**
 * useMic — thu âm từ micro theo kiểu "giữ để nói" (hold-to-talk).
 *
 * `start(onPartial?)` bắt đầu thu; nếu truyền `onPartial`, hook sẽ định kỳ
 * (mỗi ~900ms) đóng gói phần audio ĐÃ thu được cho tới lúc đó thành WAV base64
 * và bắn ra callback — dùng cho STT streaming (hiện text nguồn real-time khi
 * đang nói). `stop()` dừng và trả chuỗi base64 của WAV 16kHz mono cuối cùng
 * (định dạng backend/Whisper mong đợi).
 *
 * Việc giải mã + resample dùng Web Audio API nên nằm ở hook (side-effect),
 * phần đóng gói WAV thuần ở `utils/audio`.
 */
import { useCallback, useRef, useState } from 'react';
import { encodeWavPcm16, arrayBufferToBase64 } from '@/components/utils';

/** Tần số lấy mẫu mục tiêu (Whisper hoạt động ở 16 kHz). */
const TARGET_SAMPLE_RATE = 16000;

/** Chu kỳ MediaRecorder cắt chunk (ms) — nhỏ để audio tích luỹ mượt. */
const TIMESLICE_MS = 250;

/** Chu kỳ gửi transcript tạm khi đang nói (ms). */
const PARTIAL_INTERVAL_MS = 900;

interface AudioContextCtor {
  new (): AudioContext;
}

/** Lấy AudioContext có prefix cho Safari cũ mà không dùng `any`. */
function getAudioContextCtor(): AudioContextCtor | null {
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Giải mã blob thu được -> resample 16kHz mono -> WAV base64. */
async function blobToWav16kBase64(blob: Blob): Promise<string | null> {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;

  const input = await blob.arrayBuffer();
  const ctx = new Ctor();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(input);
  } finally {
    void ctx.close();
  }

  const frameCount = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();

  const samples = rendered.getChannelData(0);
  return arrayBufferToBase64(encodeWavPcm16(samples, TARGET_SAMPLE_RATE));
}

export interface UseMic {
  isRecording: boolean;
  error: string | null;
  /**
   * Bắt đầu thu. Nếu truyền `onPartial`, mỗi ~900ms hook sẽ đóng gói phần audio
   * đã thu được cho tới lúc đó thành WAV base64 và gọi callback (STT streaming).
   */
  start: (onPartial?: (wavBase64: string) => void) => Promise<void>;
  /** Dừng thu; resolve base64 WAV cuối cùng, hoặc null nếu không có dữ liệu. */
  stop: () => Promise<string | null>;
}

export function useMic(): UseMic {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const partialTimerRef = useRef<number | null>(null);

  const clearPartialTimer = useCallback((): void => {
    if (partialTimerRef.current !== null) {
      window.clearInterval(partialTimerRef.current);
      partialTimerRef.current = null;
    }
  }, []);

  const start = useCallback(
    async (onPartial?: (wavBase64: string) => void): Promise<void> => {
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        });
        streamRef.current = stream;
        chunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (ev: BlobEvent) => {
          if (ev.data.size > 0) chunksRef.current.push(ev.data);
        };
        // timeslice => chunk được cắt liên tục để có audio tích luỹ khi đang nói.
        recorder.start(TIMESLICE_MS);
        recorderRef.current = recorder;
        setIsRecording(true);

        // STT streaming: định kỳ đóng gói audio-tới-hiện-tại và bắn ra callback.
        // Concat các chunk từ đầu tạo ra một webm hợp lệ (chunk đầu chứa header),
        // nên decode được. Bỏ qua tick nếu lần trước còn đang xử lý / decode lỗi.
        if (onPartial) {
          let flushing = false;
          partialTimerRef.current = window.setInterval(() => {
            if (flushing || chunksRef.current.length === 0) return;
            flushing = true;
            const mimeType = recorder.mimeType || 'audio/webm';
            const blob = new Blob(chunksRef.current, { type: mimeType });
            void blobToWav16kBase64(blob)
              .then((b64) => {
                if (b64) onPartial(b64);
              })
              .catch(() => {
                /* decode có thể lỗi ở ranh giới cluster — bỏ qua tick này */
              })
              .finally(() => {
                flushing = false;
              });
          }, PARTIAL_INTERVAL_MS);
        }
      } catch {
        setError('Không truy cập được micro. Kiểm tra quyền trình duyệt và thiết bị.');
        setIsRecording(false);
      }
    },
    [],
  );

  const stop = useCallback(async (): Promise<string | null> => {
    clearPartialTimer();
    const recorder = recorderRef.current;
    if (!recorder) return null;

    const mimeType = recorder.mimeType || 'audio/webm';
    const finished = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeType }));
    });
    recorder.stop();
    const blob = await finished;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setIsRecording(false);

    if (blob.size === 0) return null;
    try {
      return await blobToWav16kBase64(blob);
    } catch {
      setError('Xử lý âm thanh thất bại. Thử lại lượt nói.');
      return null;
    }
  }, [clearPartialTimer]);

  return { isRecording, error, start, stop };
}
