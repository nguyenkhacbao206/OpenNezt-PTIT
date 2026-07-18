/**
 * Màn NGHE/NÓI hợp nhất (thay Demo4 Meeting + Demo6 YourTurn).
 *
 * Immersive: hero chữ lớn GIỮA màn hiện đoạn voice + bản dịch. Push-to-talk bằng
 * nút "Nhấn giữ để nói" hoặc giữ phím Space (web). Giữ phím Alt (web) mở panel
 * "Lịch sử dịch" dạng bong bóng chat (lời mình phải, đối tác trái). Chỉ push-to-
 * talk, không có chế độ rảnh tay.
 *
 *   - Đang nghe: hero = bản dịch sang ngôn ngữ CỦA BẠN + câu gốc; top "Đang nghe".
 *   - Đang nói (giữ nút/Space): hero accent = lời bạn + "Đang gửi tới đối tác…".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { History, Lock, Mic, PhoneOff, Volume2 } from 'lucide-react-native';

import { useMeetingMic, useResponsive } from '@/components/hooks';
import type { RttStackScreenProps } from '@/navigation/rttTypes';
import type { Speaker, TranslatorTurn } from '@/types/translator';
import { useStore } from '@/store';

const TP = { accent: '#5EEAD4', text2: '#9AA0A6', muted: '#585E66', red: '#ff6669', black: '#000000' };
const WAVE = [8, 16, 11, 20, 9, 15, 7];

/**
 * Chạy chữ dần theo từng từ ("đánh máy"), tránh giật cả cụm.
 * - `syncMs`: độ dài audio (ms) — nếu có, pace nhịp để chạy trọn audio.
 * - `syncKey`: đổi key ⇒ lượt mới, reset về đầu và gõ lại từ đầu.
 * - Fallback: khi `syncKey` mới mà chưa có `syncMs`, hoãn bắt đầu gõ tối đa
 *   ~400ms chờ audio; hết 400ms vẫn chưa có thì gõ nhịp mặc định.
 */
function useReveal(
  text: string,
  opts?: { syncMs?: number; syncKey?: string; cadence?: number },
): string {
  const { syncMs, syncKey, cadence: baseCadence = 55 } = opts ?? {};
  const [shown, setShown] = useState('');
  const wordsRef = useRef<string[]>([]);
  const iRef = useRef(0);
  const keyRef = useRef<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const words = (text || '').split(/\s+/).filter(Boolean);
    wordsRef.current = words;

    // Lượt mới (syncKey đổi) → reset về đầu để gõ lại khớp audio.
    if (syncKey !== keyRef.current) {
      keyRef.current = syncKey;
      iRef.current = 0;
    }
    if (iRef.current > words.length) iRef.current = 0; // text ngắn lại → lượt mới

    // Nhịp: có syncMs thì trải đều theo độ dài audio, kẹp 40..400ms.
    const cadence =
      syncMs && words.length > 0
        ? Math.min(400, Math.max(40, syncMs / words.length))
        : baseCadence;

    // Hoãn bắt đầu tối đa 400ms nếu đang chờ audio (có syncKey nhưng chưa có
    // syncMs và chưa gõ chữ nào). Sau 400ms hoặc khi có syncMs → gõ ngay.
    const waitingAudio = syncKey !== undefined && !syncMs && iRef.current === 0;
    const startDelay = waitingAudio ? 400 : 0;

    const tick = () => {
      if (timer.current) clearTimeout(timer.current);
      if (iRef.current >= wordsRef.current.length) {
        setShown(wordsRef.current.join(' '));
        return;
      }
      iRef.current += 1;
      setShown(wordsRef.current.slice(0, iRef.current).join(' '));
      timer.current = setTimeout(tick, cadence);
    };

    timer.current = setTimeout(tick, startDelay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text, syncMs, syncKey, baseCadence]);

  return shown;
}

/** Bong bóng trong panel lịch sử — lời mình canh phải (viền accent), đối tác trái. */
function HistoryBubble({
  turn,
  peerName,
  srcLang,
  dstLang,
  compact,
}: {
  turn: TranslatorTurn;
  peerName: string;
  srcLang: string;
  dstLang: string;
  compact: boolean;
}) {
  const mine = turn.mine === true;
  const label = mine ? 'Bạn' : peerName;
  const langTag = (mine ? srcLang : dstLang).toUpperCase();
  return (
    <View className={`w-full flex-row ${mine ? 'justify-end' : 'justify-start'}`}>
      <View
        className={`gap-1.5 rounded-2xl border bg-tp-surface p-3.5 ${
          mine ? 'border-tp-accent' : 'border-tp-border'
        } ${compact ? 'max-w-[88%]' : 'w-[560px] max-w-full'}`}
      >
        <View className="flex-row items-center gap-2">
          <Text className="text-[13px] font-semibold text-tp-text">{label}</Text>
          <View className="rounded-full border border-tp-border bg-tp-bg px-2 py-0.5">
            <Text className="text-[10px] text-tp-text2">{langTag}</Text>
          </View>
        </View>
        <Text className="text-[15px] leading-[21px] text-tp-text">
          {mine ? turn.srcText : turn.dstText}
        </Text>
        {mine
          ? !!turn.dstText && (
              <Text className="text-[12px] leading-[17px] text-tp-muted">Dịch: {turn.dstText}</Text>
            )
          : !!turn.srcText &&
            turn.srcText !== turn.dstText && (
              <Text className="text-[12px] leading-[17px] text-tp-muted">Gốc: {turn.srcText}</Text>
            )}
      </View>
    </View>
  );
}

export function Demo4Meeting({ navigation }: RttStackScreenProps<'Meeting'>) {
  const { compact } = useResponsive();
  const insets = useSafeAreaInsets();
  const mic = useMeetingMic();
  const status = useStore((s) => s.translatorStatus);
  const live = useStore((s) => s.live);
  const turns = useStore((s) => s.turns);
  const srcLang = useStore((s) => s.srcLang);
  const dstLang = useStore((s) => s.dstLang);
  const room = useStore((s) => s.room);
  const ttsOn = useStore((s) => s.ttsOn);
  const audioCue = useStore((s) => s.audioCue);
  const leaveRoom = useStore((s) => s.leaveRoom);

  const [historyOpen, setHistoryOpen] = useState(false);
  const historyScroll = useRef<ScrollView>(null);

  const speaker: Speaker = srcLang === 'vi' ? 'vn' : 'sg';
  const speaking = mic.recording;
  const peerName = room?.peer.name ?? 'Đối tác';

  // Đối tác rời/mất kết nối → về lobby.
  useEffect(() => {
    if (!room && status === 'connected') navigation.navigate('Devices');
  }, [room, status, navigation]);

  // Push-to-talk: bắt đầu/kết thúc một lượt nói.
  const startTalk = useCallback(() => {
    if (!mic.recording) void mic.start(speaker);
  }, [mic, speaker]);
  const stopTalk = useCallback(() => {
    if (mic.recording) void mic.stop();
  }, [mic]);

  // Phím tắt web: Space giữ để nói, Alt giữ để xem lịch sử. Chỉ áp dụng trên web
  // và gỡ listener khi rời màn. Dùng ref để đăng ký listener MỘT lần.
  const startRef = useRef(startTalk);
  const stopRef = useRef(stopTalk);
  startRef.current = startTalk;
  stopRef.current = stopTalk;
  const spaceHeld = useRef(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (!spaceHeld.current) {
          spaceHeld.current = true;
          startRef.current();
        }
      } else if (e.key === 'Alt') {
        e.preventDefault();
        setHistoryOpen(true);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeld.current = false;
        stopRef.current();
      } else if (e.key === 'Alt') {
        setHistoryOpen(false);
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // Cuộn lịch sử xuống cuối khi mở / có lượt mới.
  useEffect(() => {
    if (historyOpen) historyScroll.current?.scrollToEnd({ animated: false });
  }, [historyOpen, turns.length]);

  // HERO: đang nói → lời mình; đang nghe → bản dịch (ngôn ngữ mình) của đối tác,
  // giữ lại lượt gần nhất khi im lặng.
  const lastPeer = useMemo(
    () => [...turns].reverse().find((t) => t.mine !== true) ?? null,
    [turns],
  );
  // Cụm đang được ĐỌC (audio đang phát) — hero bám theo để chữ khớp tai; audio
  // phát cuốn chiếu (hàng đợi) nên trễ hơn lúc chữ về.
  const playingTurn = audioCue ? turns.find((t) => t.id === audioCue.turnId) ?? null : null;
  // Dùng `||` (không phải `??`) để chuỗi rỗng cũng rơi xuống fallback.
  const heroBig = speaking
    ? live?.srcText || ''
    : playingTurn?.dstText || lastPeer?.dstText || '';
  const heroSrc = speaking ? '' : playingTurn?.srcText || lastPeer?.srcText || '';
  // Hero khớp audio khi ĐANG NGHE: ưu tiên cụm đang phát, fallback lượt gần nhất.
  const heroTurnId = !speaking ? playingTurn?.id ?? lastPeer?.id : undefined;
  const cue = audioCue && audioCue.turnId === heroTurnId ? audioCue : null;
  const typed = useReveal(heroBig, { syncMs: cue?.durationMs, syncKey: heroTurnId });
  const typing = typed.length < heroBig.length;

  const endMeeting = () => {
    leaveRoom();
    navigation.navigate('EndSession');
  };

  const dotColor = status === 'connected' ? TP.accent : status === 'error' ? TP.red : TP.muted;

  return (
    <View className="flex-1 bg-tp-bg" style={{ paddingTop: insets.top }}>
      {/* Top bar */}
      <View
        className={`flex-row flex-wrap items-center justify-between gap-y-2 border-b border-tp-border ${
          compact ? 'px-4 py-3' : 'px-8 py-[18px]'
        }`}
      >
        <View className="flex-row items-center gap-2.5">
          <View className="flex-row items-center gap-2 rounded-full border border-tp-border bg-tp-surface px-3.5 py-2">
            <Lock size={14} color={TP.accent} />
            <Text className="text-[13px] font-semibold tracking-[1px] text-tp-text">
              {srcLang.toUpperCase()} → {dstLang.toUpperCase()}
            </Text>
          </View>
          <Text className="text-[15px] font-medium text-tp-text" numberOfLines={1}>
            {speaking ? `Đang gửi tới ${peerName}` : `Đang nghe ${peerName}`}
          </Text>
        </View>
        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1.5">
            <View className="h-[9px] w-[9px] rounded-full" style={{ backgroundColor: dotColor }} />
            <Text className="text-[13px] font-semibold text-tp-accent">LIVE</Text>
          </View>
          <Pressable
            onPress={() => setHistoryOpen((v) => !v)}
            className="flex-row items-center gap-1.5 rounded-full border border-tp-border bg-tp-surface px-3 py-2"
          >
            <History size={15} color={TP.text2} />
            {!compact && <Text className="text-[13px] text-tp-text2">Lịch sử</Text>}
          </Pressable>
          <Pressable
            onPress={endMeeting}
            className="flex-row items-center gap-2 rounded-full bg-tp-surface px-[14px] py-2"
            style={{ borderWidth: 1, borderColor: '#E7000B' }}
          >
            <PhoneOff size={15} color={TP.red} />
            <Text className="text-sm font-medium" style={{ color: TP.red }}>
              Kết thúc
            </Text>
          </Pressable>
        </View>
      </View>

      {/* HERO — voice + bản dịch giữa màn (kẹp số dòng để không tràn) */}
      <View className="flex-1 items-center justify-center px-6">
        <Text
          className="text-[13px] font-semibold tracking-[2px]"
          style={{ color: speaking ? TP.accent : TP.text2 }}
        >
          {speaking ? 'ĐANG NÓI' : 'ĐANG NGHE'}
        </Text>
        <View
          style={{ maxHeight: compact ? 220 : 380, overflow: 'hidden', maxWidth: 1000 }}
          className="mt-5 items-center"
        >
          {heroBig ? (
            <Text
              numberOfLines={compact ? 4 : 5}
              className={`text-center font-semibold ${
                compact ? 'text-[26px] leading-[34px]' : 'text-[44px] leading-[54px]'
              }`}
              style={{ color: speaking ? TP.accent : '#EDEFF2' }}
            >
              {typed || '…'}
              {typing && <Text style={{ color: TP.accent }}>▍</Text>}
            </Text>
          ) : (
            <Text className="text-center text-lg text-tp-muted" style={{ maxWidth: 720 }}>
              {status === 'connected'
                ? `Đã ghép với ${peerName}. Giữ nút bên dưới để nói, hoặc chờ ${peerName} nói.`
                : 'Mất kết nối phòng. Quay lại danh sách thiết bị để ghép lại.'}
            </Text>
          )}
        </View>
        {speaking ? (
          <Text className="mt-5 text-center text-base text-tp-text2" numberOfLines={2} style={{ maxWidth: 800 }}>
            Đang gửi bản dịch tới {peerName}…
          </Text>
        ) : (
          !!heroSrc && (
            <Text className="mt-5 text-center text-base text-tp-text2" numberOfLines={2} style={{ maxWidth: 800 }}>
              Gốc: {heroSrc}
            </Text>
          )
        )}
      </View>

      {/* Dải đọc to (TTS) khi đang nghe */}
      {!speaking && ttsOn && (
        <View className="flex-row items-center justify-center gap-3 border-t border-tp-border bg-tp-surface px-8 py-3">
          <Volume2 size={16} color={TP.accent} />
          <View className="h-[18px] flex-row items-end gap-[3px]">
            {WAVE.map((h, i) => (
              <View key={i} className="w-[3px] rounded-sm bg-tp-accent" style={{ height: h }} />
            ))}
          </View>
          <Text className="text-[13px] text-tp-text2">Đang đọc to bản dịch…</Text>
        </View>
      )}

      {/* Push-to-talk */}
      <View
        className="items-center gap-2 border-t border-tp-border px-8 pt-5"
        style={{ paddingBottom: insets.bottom + 20 }}
      >
        <Pressable
          onPressIn={startTalk}
          onPressOut={stopTalk}
          disabled={status !== 'connected'}
          className="flex-row items-center justify-center gap-3 rounded-full px-12 py-5"
          style={{
            backgroundColor: status !== 'connected' ? TP.muted : speaking ? TP.red : TP.accent,
          }}
        >
          <Mic size={24} color={speaking ? '#ffffff' : TP.black} />
          <Text
            className="text-lg font-bold"
            style={{ color: speaking ? '#ffffff' : TP.black }}
          >
            {speaking ? 'Đang nói… (thả để gửi)' : 'Nhấn giữ để nói'}
          </Text>
        </Pressable>
        {mic.error ? (
          <Text className="text-sm" style={{ color: '#ff8a99' }}>
            {mic.error}
          </Text>
        ) : Platform.OS === 'web' ? (
          <Text className="text-[13px] text-tp-muted">
            Phím tắt: Space giữ để nói · Alt giữ để xem lịch sử
          </Text>
        ) : (
          <Text className="text-[13px] text-tp-muted">Giữ nút để nói, thả ra để gửi bản dịch.</Text>
        )}
      </View>

      {/* Panel Lịch sử dịch — mở bằng giữ Alt (web) hoặc chạm nút Lịch sử */}
      {historyOpen && (
        <View className="absolute inset-0" style={{ backgroundColor: 'rgba(6,9,12,0.94)', paddingTop: insets.top }}>
          <View
            className={`flex-row items-center justify-between border-b border-tp-border ${
              compact ? 'px-4 py-3' : 'px-8 py-[18px]'
            }`}
          >
            <View className="flex-row items-center gap-2.5">
              <History size={18} color={TP.accent} />
              <Text className="text-lg font-semibold text-tp-text">Lịch sử dịch</Text>
            </View>
            <Pressable
              onPress={() => setHistoryOpen(false)}
              className="rounded-full border border-tp-border bg-tp-surface px-4 py-2"
            >
              <Text className="text-sm text-tp-text2">
                {Platform.OS === 'web' ? 'Thả Alt để đóng' : 'Đóng'}
              </Text>
            </Pressable>
          </View>
          <ScrollView
            ref={historyScroll}
            className="flex-1"
            contentContainerStyle={{
              paddingHorizontal: compact ? 16 : 32,
              paddingVertical: 16,
              paddingBottom: insets.bottom + 24,
              gap: 12,
            }}
          >
            {turns.length === 0 ? (
              <Text className="py-10 text-center text-base text-tp-muted">
                Chưa có câu nào trong phiên.
              </Text>
            ) : (
              turns.map((t) => (
                <HistoryBubble
                  key={t.id}
                  turn={t}
                  peerName={peerName}
                  srcLang={srcLang}
                  dstLang={dstLang}
                  compact={compact}
                />
              ))
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
