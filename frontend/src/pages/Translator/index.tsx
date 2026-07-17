/**
 * TranslatorPage — trợ lý phiên dịch song ngữ Việt ⇄ Anh real-time.
 *
 * Bố cục Split-Screen theo SRS: nửa trên là phía Singapore (English), nửa dưới
 * là đoàn Việt Nam (Tiếng Việt). Mỗi panel chỉ hiển thị nội dung BẰNG NGÔN NGỮ
 * CỦA CHÍNH NÓ — panel người nói hiện câu GỐC, panel bên kia hiện BẢN DỊCH — và
 * text hiện ra theo từng chữ (word-by-word).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { useMic, useWordReveal, useSpeechRecognition, useTranslationSegmenter } from '@/components/hooks';
import { cn } from '@/components/utils';
import { useAppStore } from '@/store';
import type { PartialLine, Speaker, TranslatorTurn } from '@/types';

interface SideConfig {
  speaker: Speaker;
  title: string;
  ownLabel: string; // nhãn khi chính phía này nói (câu gốc)
  translatedLabel: string; // nhãn khi hiển thị bản dịch từ phía kia
  accent: string;
}

const SG_SIDE: SideConfig = {
  speaker: 'sg',
  title: '🇸🇬 Đối tác Singapore (English)',
  ownLabel: 'Họ nói (English)',
  translatedLabel: 'Bản dịch (English)',
  accent: 'bg-blue-50 dark:bg-blue-950/30',
};

const VN_SIDE: SideConfig = {
  speaker: 'vn',
  title: '🇻🇳 Đoàn Việt Nam (Tiếng Việt)',
  ownLabel: 'Bạn nói (Tiếng Việt)',
  translatedLabel: 'Bản dịch (Tiếng Việt)',
  accent: 'bg-emerald-50 dark:bg-emerald-950/30',
};

export function TranslatorPage() {
  const status = useAppStore((s) => s.translatorStatus);
  const mode = useAppStore((s) => s.translatorMode);
  const error = useAppStore((s) => s.translatorError);
  const turns = useAppStore((s) => s.turns);
  const liveOriginal = useAppStore((s) => s.liveOriginal);
  const liveTranslation = useAppStore((s) => s.liveTranslation);
  const metrics = useAppStore((s) => s.metrics);

  const connect = useAppStore((s) => s.connect);
  const disconnect = useAppStore((s) => s.disconnect);
  const setMode = useAppStore((s) => s.setTranslatorMode);
  const sendPartial = useAppStore((s) => s.sendPartial);
  const sendTurn = useAppStore((s) => s.sendTurn);
  const clearTurns = useAppStore((s) => s.clearTurns);
  const sendTextPartial = useAppStore((s) => s.sendTextPartial);
  const sendTextFinal = useAppStore((s) => s.sendTextFinal);
  const setCaption = useAppStore((s) => s.setCaption);

  const mic = useMic();
  const [activeSpeaker, setActiveSpeaker] = useState<Speaker | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const lastTranscriptRef = useRef<string>('');

  const segmenter = useTranslationSegmenter({
    onCaption: (text) => {
      const sp = speakerRef.current;
      if (sp) setCaption(sp, text || null);
    },
    onPartial: (text) => {
      const sp = speakerRef.current;
      if (sp) sendTextPartial(sp, text);
    },
    onFinal: (text) => {
      const sp = speakerRef.current;
      if (sp) sendTextFinal(sp, text);
    },
  });
  const speech = useSpeechRecognition({
    onInterim: (text) => {
      lastTranscriptRef.current = text;
      segmenter.push(text, false);
    },
    onFinal: (text) => {
      lastTranscriptRef.current = '';
      segmenter.push(text, true);
    },
  });
  const useSpeechPath = mode === 'cloud' && speech.supported;

  // Tự kết nối khi vào trang, tự đóng khi rời trang (zero-retention).
  useEffect(() => {
    connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTalk = useCallback(
    async (speaker: Speaker): Promise<void> => {
      if (activeSpeaker === speaker) {
        // Dừng
        if (useSpeechPath) {
          speech.stop();
          const last = lastTranscriptRef.current;
          if (last.trim()) segmenter.push(last, true); // chốt đuôi cuối TRƯỚC khi bỏ speaker
          segmenter.reset();
          lastTranscriptRef.current = '';
          setCaption(speaker, null);
        } else {
          const audio = await mic.stop();
          if (audio) sendTurn(speaker, audio);
        }
        setActiveSpeaker(null);
        speakerRef.current = null;
      } else if (activeSpeaker === null) {
        // Bắt đầu
        setActiveSpeaker(speaker);
        speakerRef.current = speaker;
        if (useSpeechPath) {
          segmenter.reset();
          lastTranscriptRef.current = '';
          speech.start(speaker === 'vn' ? 'vi-VN' : 'en-US');
        } else {
          await mic.start((audioBase64) => sendPartial(speaker, audioBase64));
        }
      }
    },
    [activeSpeaker, mic, sendPartial, sendTurn, useSpeechPath, speech, segmenter, setCaption],
  );

  const isConnected = status === 'connected';

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl flex-col gap-3">
      {/* Thanh điều khiển trên cùng */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {STATUS_LABEL[status]}
          </span>
          <ModeToggle mode={mode} onChange={setMode} />
        </div>

        <LatencyHud
          sttMs={metrics?.sttMs ?? null}
          nmtMs={metrics?.nmtMs ?? null}
          e2eMs={metrics?.e2eMs ?? null}
        />

        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={clearTurns}>
            Xoá hội thoại
          </Button>
          {isConnected ? (
            <Button size="sm" variant="danger" onClick={disconnect}>
              Ngắt
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={connect}>
              Kết nối
            </Button>
          )}
        </div>
      </header>

      {(error || mic.error || speech.error) && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {speech.error ?? mic.error ?? error}
        </div>
      )}
      {mode === 'cloud' && !speech.supported && (
        <div className="rounded-lg border border-amber-400/40 bg-amber-50/60 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-300">
          Trình duyệt không hỗ trợ nhận dạng giọng nói — tự dùng luồng Whisper (windowed).
        </div>
      )}

      {/* Split-screen */}
      <Panel
        side={SG_SIDE}
        turns={turns}
        liveOriginal={liveOriginal}
        liveTranslation={liveTranslation}
        isRecording={activeSpeaker === 'sg'}
        disabled={!isConnected || (activeSpeaker !== null && activeSpeaker !== 'sg')}
        onTalk={() => void handleTalk('sg')}
      />
      <Panel
        side={VN_SIDE}
        turns={turns}
        liveOriginal={liveOriginal}
        liveTranslation={liveTranslation}
        isRecording={activeSpeaker === 'vn'}
        disabled={!isConnected || (activeSpeaker !== null && activeSpeaker !== 'vn')}
        onTalk={() => void handleTalk('vn')}
      />
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  disconnected: 'Đã ngắt',
  connecting: 'Đang kết nối…',
  connected: 'Đã kết nối',
  error: 'Lỗi kết nối',
};

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'connected'
      ? 'bg-emerald-500'
      : status === 'connecting'
        ? 'bg-amber-500 animate-pulse'
        : status === 'error'
          ? 'bg-danger'
          : 'bg-gray-400';
  return <span className={cn('h-2.5 w-2.5 rounded-full', color)} />;
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: string;
  onChange: (mode: 'cloud' | 'mock') => void;
}) {
  const next = mode === 'cloud' ? 'mock' : 'cloud';
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
      title="Chuyển chế độ Cloud ⇄ Mock"
    >
      Chế độ: {mode === 'cloud' ? 'Cloud (Groq)' : 'Mock'}
    </button>
  );
}

function LatencyHud({
  sttMs,
  nmtMs,
  e2eMs,
}: {
  sttMs: number | null;
  nmtMs: number | null;
  e2eMs: number | null;
}) {
  const fmt = (v: number | null): string => (v === null ? '—' : `${Math.round(v)}ms`);
  return (
    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
      <span>STT {fmt(sttMs)}</span>
      <span>NMT {fmt(nmtMs)}</span>
      <span className="font-semibold text-gray-700 dark:text-gray-200">E2E {fmt(e2eMs)}</span>
    </div>
  );
}

interface PanelProps {
  side: SideConfig;
  turns: TranslatorTurn[];
  liveOriginal: PartialLine | null;
  liveTranslation: PartialLine | null;
  isRecording: boolean;
  disabled: boolean;
  onTalk: () => void;
}

/** Text của một lượt nói, quy về NGÔN NGỮ của panel `side`. */
function panelText(turn: TranslatorTurn, side: SideConfig): string {
  return turn.speaker === side.speaker ? turn.srcText : turn.dstText;
}

function Panel({
  side,
  turns,
  liveOriginal,
  liveTranslation,
  isRecording,
  disabled,
  onTalk,
}: PanelProps) {
  const newest = turns.at(-1) ?? null;

  // Câu mới nhất: cuộn ra từng chữ (bằng ngôn ngữ của panel này).
  const newestText = newest ? panelText(newest, side) : '';
  const revealedNewest = useWordReveal(newestText, newest?.id);

  // Panel người nói: transcript GỐC hiện dần khi đang nói.
  const originalText =
    liveOriginal && liveOriginal.speaker === side.speaker ? liveOriginal.text : '';
  const revealedOriginal = useWordReveal(originalText, `orig-${side.speaker}`);

  // Panel bên kia: BẢN DỊCH của phần đã nói hiện ngay khi người kia đang nói.
  const translationText =
    liveTranslation && liveTranslation.speaker !== side.speaker
      ? liveTranslation.text
      : '';
  const revealedTranslation = useWordReveal(translationText, `trans-${side.speaker}`);

  const isEmpty = turns.length === 0 && !originalText && !translationText;

  return (
    <section
      className={cn(
        'flex flex-1 flex-col gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700',
        side.accent,
      )}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{side.title}</h2>
        <Button
          size="sm"
          variant={isRecording ? 'danger' : 'primary'}
          onClick={onTalk}
          disabled={disabled}
        >
          {isRecording ? '■ Dừng & Chốt' : '● Nhấn để nói'}
        </Button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {isEmpty && <p className="text-sm text-gray-400">Chưa có lượt nói nào.</p>}

        {turns.map((turn, i) => {
          const isOwn = turn.speaker === side.speaker;
          const isNewest = i === turns.length - 1;
          const full = panelText(turn, side);
          const shown = isNewest ? revealedNewest : full;
          const revealing = isNewest && shown !== full;
          return (
            <div
              key={turn.id}
              className={cn(
                'rounded-lg p-3 shadow-sm',
                isOwn ? 'bg-white/70 dark:bg-gray-900/40' : 'bg-white/40 dark:bg-gray-900/20',
              )}
            >
              <p className="text-xs uppercase tracking-wide text-gray-400">
                {isOwn ? side.ownLabel : side.translatedLabel}
              </p>
              <p
                className={cn(
                  isOwn
                    ? 'text-gray-800 dark:text-gray-100'
                    : 'font-medium text-primary dark:text-primary-light',
                )}
              >
                {shown}
                {revealing && <span className="ml-0.5 animate-pulse">▋</span>}
              </p>
            </div>
          );
        })}

        {/* Đang nói: transcript GỐC cuộn từng chữ trên panel người nói. */}
        {originalText && (
          <div className="rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-600">
            <p className="text-xs uppercase tracking-wide text-gray-400">🎙 Đang nói…</p>
            <p className="text-gray-700 dark:text-gray-200">
              {revealedOriginal}
              <span className="ml-0.5 animate-pulse">▋</span>
            </p>
          </div>
        )}

        {/* Đang dịch: BẢN DỊCH phần đã nói hiện ngay trên panel bên kia. */}
        {translationText && (
          <div className="rounded-lg border border-dashed border-amber-400 bg-amber-50/50 p-3 dark:border-amber-500/50 dark:bg-amber-950/20">
            <p className="text-xs uppercase tracking-wide text-amber-600 dark:text-amber-400">
              ⏳ Đang dịch…
            </p>
            <p className="font-medium text-amber-700 dark:text-amber-300">
              {revealedTranslation}
              <span className="ml-0.5 animate-pulse">▋</span>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export default TranslatorPage;
