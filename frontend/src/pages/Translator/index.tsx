/**
 * TranslatorPage — trợ lý phiên dịch song ngữ Việt ⇄ Anh real-time.
 *
 * Bố cục Split-Screen theo SRS: nửa trên là phía Singapore (English), nửa dưới
 * là đoàn Việt Nam (Tiếng Việt). Mỗi bên có nút "Giữ để nói" (hold-to-talk):
 * khi ĐANG giữ, audio được stream liên tục → transcript nguồn hiện real-time;
 * khi THẢ, backend chạy full pipeline → bản dịch hiện ra.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { useMic } from '@/components/hooks';
import { cn } from '@/components/utils';
import { useAppStore } from '@/store';
import type { Speaker, TranslatorTurn } from '@/types';

interface SideConfig {
  speaker: Speaker;
  title: string;
  spokenLabel: string;
  translatedLabel: string;
  accent: string; // class nền nhấn cho panel
}

const SG_SIDE: SideConfig = {
  speaker: 'sg',
  title: '🇸🇬 Đối tác Singapore (English)',
  spokenLabel: 'English',
  translatedLabel: 'Tiếng Việt',
  accent: 'bg-blue-50 dark:bg-blue-950/30',
};

const VN_SIDE: SideConfig = {
  speaker: 'vn',
  title: '🇻🇳 Đoàn Việt Nam (Tiếng Việt)',
  spokenLabel: 'Tiếng Việt',
  translatedLabel: 'English',
  accent: 'bg-emerald-50 dark:bg-emerald-950/30',
};

export function TranslatorPage() {
  const status = useAppStore((s) => s.translatorStatus);
  const mode = useAppStore((s) => s.translatorMode);
  const error = useAppStore((s) => s.translatorError);
  const turns = useAppStore((s) => s.turns);
  const partial = useAppStore((s) => s.partial);
  const metrics = useAppStore((s) => s.metrics);

  const connect = useAppStore((s) => s.connect);
  const disconnect = useAppStore((s) => s.disconnect);
  const setMode = useAppStore((s) => s.setTranslatorMode);
  const streamPartial = useAppStore((s) => s.streamPartial);
  const sendTurn = useAppStore((s) => s.sendTurn);
  const clearTurns = useAppStore((s) => s.clearTurns);

  const mic = useMic();
  const [activeSpeaker, setActiveSpeaker] = useState<Speaker | null>(null);

  // Tự kết nối khi vào trang, tự đóng khi rời trang (zero-retention).
  useEffect(() => {
    connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bắt đầu giữ mic: thu + stream audio tích luỹ để hiện transcript real-time.
  const startTalk = useCallback(
    async (speaker: Speaker): Promise<void> => {
      if (activeSpeaker !== null) return;
      setActiveSpeaker(speaker);
      await mic.start((audio) => streamPartial(speaker, audio));
    },
    [activeSpeaker, mic, streamPartial],
  );

  // Thả mic: chốt lượt nói, gửi audio cuối để chạy full STT→NMT→TTS.
  const stopTalk = useCallback(
    async (speaker: Speaker): Promise<void> => {
      if (activeSpeaker !== speaker) return;
      setActiveSpeaker(null);
      const audio = await mic.stop();
      if (audio) sendTurn(speaker, audio);
    },
    [activeSpeaker, mic, sendTurn],
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

      {(error || mic.error) && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {mic.error ?? error}
        </div>
      )}

      {/* Split-screen */}
      <Panel
        side={SG_SIDE}
        turns={turns}
        partialText={partial?.speaker === 'sg' ? partial.text : null}
        partialSrc={partial?.speaker === 'sg' ? (partial.srcText ?? null) : null}
        isRecording={activeSpeaker === 'sg'}
        disabled={!isConnected || (activeSpeaker !== null && activeSpeaker !== 'sg')}
        onStart={() => void startTalk('sg')}
        onStop={() => void stopTalk('sg')}
      />
      <Panel
        side={VN_SIDE}
        turns={turns}
        partialText={partial?.speaker === 'vn' ? partial.text : null}
        partialSrc={partial?.speaker === 'vn' ? (partial.srcText ?? null) : null}
        isRecording={activeSpeaker === 'vn'}
        disabled={!isConnected || (activeSpeaker !== null && activeSpeaker !== 'vn')}
        onStart={() => void startTalk('vn')}
        onStop={() => void stopTalk('vn')}
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
  /** Bản dịch tạm (ngôn ngữ đích) khi đang nói. */
  partialText: string | null;
  /** Câu nguồn nhận dạng tạm (ngôn ngữ nói) khi đang nói. */
  partialSrc: string | null;
  isRecording: boolean;
  disabled: boolean;
  /** Bắt đầu khi NHẤN GIỮ nút. */
  onStart: () => void;
  /** Kết thúc khi THẢ nút (hoặc pointer bị huỷ). */
  onStop: () => void;
}

function Panel({
  side,
  turns,
  partialText,
  partialSrc,
  isRecording,
  disabled,
  onStart,
  onStop,
}: PanelProps) {
  const own = turns.filter((t) => t.speaker === side.speaker);
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
          disabled={disabled}
          className={cn('touch-none select-none', isRecording && 'animate-pulse')}
          // Giữ để nói: pointer capture đảm bảo nhận được pointerup kể cả khi
          // ngón tay/chuột rời khỏi nút, nên không cần onPointerLeave.
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            onStart();
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            onStop();
          }}
          onPointerCancel={() => onStop()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {isRecording ? '🔴 Đang nghe… (thả để dịch)' : '🎙 Giữ để nói'}
        </Button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {own.length === 0 && !partialText && !isRecording && (
          <p className="text-sm text-gray-400">Chưa có lượt nói nào. Giữ nút để nói.</p>
        )}
        {own.map((turn) => (
          <div
            key={turn.id}
            className="rounded-lg bg-white/70 p-3 shadow-sm dark:bg-gray-900/40"
          >
            <p className="text-xs uppercase tracking-wide text-gray-400">{side.spokenLabel}</p>
            <p className="text-gray-800 dark:text-gray-100">{turn.srcText}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">
              {side.translatedLabel}
            </p>
            <p className="font-medium text-primary dark:text-primary-light">{turn.dstText}</p>
          </div>
        ))}
        {(isRecording || partialText || partialSrc) && (
          <div className="rounded-lg border border-dashed border-primary/50 p-3 dark:border-primary/50">
            {/* Câu nguồn nhận dạng tạm (nhỏ, mờ). */}
            {partialSrc && (
              <>
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  {side.spokenLabel}
                </p>
                <p className="text-gray-500 dark:text-gray-400">{partialSrc}</p>
              </>
            )}
            {/* Bản dịch trực tiếp (ngôn ngữ đích) — nổi bật. */}
            <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">
              {isRecording ? `🎙 ${side.translatedLabel} (dịch trực tiếp)` : `⏳ ${side.translatedLabel}`}
            </p>
            <p className="font-medium text-primary dark:text-primary-light">
              {partialText || '…'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export default TranslatorPage;
