/**
 * useSpeechRecognition — bọc Web Speech API cho phụ đề gốc kiểu YouTube.
 *
 * Chỉ dùng ở Cloud mode (audio đi qua dịch vụ của trình duyệt/Google). Trả
 * `supported=false` nếu trình duyệt không hỗ trợ để caller tự fallback.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): { readonly transcript: string };
  [index: number]: { readonly transcript: string };
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    item(index: number): SpeechRecognitionResultLike;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface SpeechRecognitionHandlers {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
}

export interface UseSpeechRecognition {
  supported: boolean;
  listening: boolean;
  error: string | null;
  start: (lang: string) => void;
  stop: () => void;
}

export function useSpeechRecognition(
  handlers: SpeechRecognitionHandlers,
): UseSpeechRecognition {
  const ctorRef = useRef<SpeechRecognitionCtor | null>(getCtor());
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback((lang: string) => {
    const Ctor = ctorRef.current;
    if (!Ctor) return;
    setError(null);
    wantRef.current = true;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          handlersRef.current.onFinal(transcript.trim());
        } else {
          interim += transcript;
        }
      }
      if (interim.trim()) handlersRef.current.onInterim(interim.trim());
    };
    rec.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        setError(`Speech recognition: ${e.error}`);
      }
    };
    rec.onend = () => {
      // Web Speech tự dừng khi im lặng -> nghe lại nếu vẫn muốn.
      if (wantRef.current && recRef.current) {
        try {
          recRef.current.start();
        } catch {
          /* start() có thể ném nếu chưa kịp end; bỏ qua */
        }
      } else {
        setListening(false);
      }
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    wantRef.current = false;
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => () => {
    wantRef.current = false;
    recRef.current?.stop();
  }, []);

  return { supported: ctorRef.current !== null, listening, error, start, stop };
}
