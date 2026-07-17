/**
 * useMic — thu âm từ micro theo kiểu push-to-talk và trả về WAV base64.
 *
 * `start()` bắt đầu thu; `stop()` dừng và trả chuỗi base64 của WAV 16kHz mono
 * (định dạng backend/Whisper mong đợi). Việc giải mã + resample dùng Web Audio
 * API nên nằm ở hook (side-effect), phần đóng gói WAV thuần ở `utils/audio`.
 */
import { useCallback, useRef, useState } from 'react';
import { encodeWavPcm16, arrayBufferToBase64 } from '@/components/utils';

/** Tần số lấy mẫu mục tiêu (Whisper hoạt động ở 16 kHz). */
const TARGET_SAMPLE_RATE = 16000;

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
  start: () => Promise<void>;
  /** Dừng thu; resolve base64 WAV, hoặc null nếu không có dữ liệu. */
  stop: () => Promise<string | null>;
}

export function useMic(): UseMic {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async (): Promise<void> => {
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
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setError('Không truy cập được micro. Kiểm tra quyền trình duyệt và thiết bị.');
      setIsRecording(false);
    }
  }, []);

  const stop = useCallback(async (): Promise<string | null> => {
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
  }, []);

  return { isRecording, error, start, stop };
}
