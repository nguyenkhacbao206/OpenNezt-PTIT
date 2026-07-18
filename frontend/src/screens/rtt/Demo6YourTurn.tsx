/**
 * Demo 6 — Đến lượt bạn nói (rtt_hackathon.pen · "Demo 6 Đến lượt bạn nói").
 *
 * Bạn đang nói: bản dịch TẠM hiện lớn ở GIỮA, chạy chữ dần cho mượt (tránh "đơ
 * rồi hiện cả đoạn"). Khi đủ 4 dòng → cắt segment, gom card nhỏ lên góc TRÊN-TRÁI
 * (card cũ mờ dần nhường chỗ). Nói xong, cả lượt gộp thành MỘT entry ở Lịch sử.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, type LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { Lock, Mic, Square } from 'lucide-react-native';

import { useMeetingMic } from '@/components/hooks';
import type { RttStackScreenProps } from '@/navigation/rttTypes';
import type { TranslatorTurn } from '@/types/translator';
import { useStore } from '@/store';

const TP = { accent: '#5EEAD4', text2: '#9AA0A6', muted: '#585E66' };
const WAVE = [10, 18, 24, 14, 22, 26, 16, 20, 12];
const MAX_CENTER_H = 200; // ~4 dòng của text lớn giữa màn (leading 48)
const CUT_COOLDOWN = 1500; // tránh cắt liên tiếp do partial cũ còn về
const VISIBLE_CARDS = 4;
const CARD_OPACITY = [1, 0.7, 0.45, 0.22]; // theo tuổi: mới nhất rõ, cũ mờ dần

/** Chạy chữ dần theo từng từ (mượt hoá cập nhật ~2.5s một lần). */
function useReveal(text: string, cadence = 80): string {
  const [shown, setShown] = useState('');
  const wordsRef = useRef<string[]>([]);
  const iRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const words = (text || '').split(/\s+/).filter(Boolean);
    wordsRef.current = words;
    if (iRef.current > words.length) iRef.current = 0; // text ngắn lại → segment mới
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
    tick();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text, cadence]);

  return shown;
}

/** Card segment ở cột trái — fade/trượt khi xuất hiện, mờ dần theo tuổi. */
function LeftCard({ turn, target }: { turn: TranslatorTurn; target: number }) {
  const op = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(slide, {
      toValue: 1,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slide]);
  useEffect(() => {
    Animated.timing(op, {
      toValue: target,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [target, op]);
  return (
    <Animated.View
      className="gap-1 rounded-xl border border-tp-border bg-tp-surface p-3"
      style={{
        opacity: op,
        transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
      }}
    >
      <Text className="text-[15px] leading-[20px] text-tp-text" numberOfLines={2}>
        {turn.dstText}
      </Text>
      <Text className="text-[11px] leading-[15px] text-tp-muted" numberOfLines={1}>
        {turn.srcText}
      </Text>
    </Animated.View>
  );
}

export function Demo6YourTurn({ navigation }: RttStackScreenProps<'YourTurn'>) {
  const mic = useMeetingMic();
  const live = useStore((s) => s.live);
  const segments = useStore((s) => s.sessionSegments);
  const srcLang = useStore((s) => s.srcLang);
  const dstLang = useStore((s) => s.dstLang);
  const peerName = useStore((s) => s.room?.peer.name ?? 'đối tác');

  const cutAtRef = useRef(0);
  // Khi TÔI nói, bản dịch được gửi thẳng sang đối tác. Máy tôi chỉ nhận lại
  // transcript (stt) — hiển thị chính lời mình đang nói, chạy chữ cho mượt.
  const shownSrc = useReveal(live?.srcText ?? '');

  // Bắt đầu thu ngay khi vào màn; dừng + dọn khi rời. Nhãn phía nói theo ngôn
  // ngữ nguồn (vn=Việt, sg=Anh) chỉ để tô màu.
  useEffect(() => {
    void mic.start(srcLang === 'vi' ? 'vn' : 'sg');
    return () => {
      void mic.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Khi đoạn ở giữa vượt 4 dòng → cắt segment (đo chiều cao, tin cậy cả web).
  const onCenterLayout = (e: LayoutChangeEvent) => {
    if (e.nativeEvent.layout.height > MAX_CENTER_H && Date.now() - cutAtRef.current > CUT_COOLDOWN) {
      cutAtRef.current = Date.now();
      void mic.cut();
    }
  };

  const stopAndBack = async () => {
    await mic.stop();
    // Hết lượt → sang Lịch sử (thay YourTurn để back về Meeting), không hiện ở
    // màn thu nữa. Turn gộp sẽ xuất hiện khi nmt.result chốt về.
    navigation.replace('History');
  };

  // Card trái: mới nhất ở dưới; card cũ mờ dần.
  const visible = segments.slice(-VISIBLE_CARDS);

  return (
    <View className="flex-1 bg-tp-bg">
      {/* Top bar */}
      <View className="flex-row items-center justify-between px-8 py-[18px]">
        <View className="flex-row items-center gap-2 rounded-full border border-tp-border bg-tp-surface px-3.5 py-2">
          <Lock size={14} color={TP.accent} />
          <Text className="text-[13px] font-semibold tracking-[1px] text-tp-text">
            {srcLang.toUpperCase()} → {dstLang.toUpperCase()}
          </Text>
        </View>
        <View className="flex-row items-center gap-3">
          <Mic size={16} color={TP.accent} />
          <Text className="text-sm font-semibold tracking-[2px] text-tp-accent">BẠN ĐANG NÓI</Text>
          <View className="h-[22px] flex-row items-center gap-[3px]">
            {WAVE.map((h, i) => (
              <View key={i} className="w-[3px] rounded-full bg-tp-accent" style={{ height: h }} />
            ))}
          </View>
        </View>
        <Pressable
          onPress={() => void stopAndBack()}
          className="flex-row items-center gap-2 rounded-full px-4 py-2"
          style={{ backgroundColor: '#ff5a6e' }}
        >
          <Square size={13} color="#ffffff" fill="#ffffff" />
          <Text className="text-[13px] font-semibold text-white">Dừng &amp; Dịch</Text>
        </Pressable>
      </View>

      {/* Body */}
      <View className="flex-1 flex-row px-8 py-4">
        {/* Cột trái giữ cân đối */}
        <View className="w-[340px] pr-6" />

        {/* GIỮA — đoạn đang nói (chạy chữ; clip 4 dòng; vượt thì cắt) */}
        <View className="flex-1 items-center justify-center">
          <View
            style={{ maxHeight: MAX_CENTER_H, overflow: 'hidden', maxWidth: 900 }}
            className="items-center"
          >
            <View onLayout={onCenterLayout} className="items-center gap-3">
              <Text
                className="text-center text-[40px] font-semibold leading-[48px]"
                style={{ color: TP.accent }}
              >
                {shownSrc || (mic.recording ? '🎙 Đang nghe…' : '…')}
              </Text>
              <Text className="text-center text-lg text-tp-text2">
                Đang gửi bản dịch tới {peerName}…
              </Text>
            </View>
          </View>

          {mic.error && (
            <View className="mt-6 rounded-lg px-3 py-2" style={{ backgroundColor: '#3a1a1e' }}>
              <Text className="text-sm" style={{ color: '#ff8a99' }}>
                {mic.error}
              </Text>
            </View>
          )}
        </View>

        {/* Cột PHẢI — segment đã chốt (từ TRÊN xuống, cũ mờ dần) */}
        <View className="w-[340px] gap-2.5 pl-6">
          {visible.map((t, i) => (
            <LeftCard key={t.id} turn={t} target={CARD_OPACITY[visible.length - 1 - i] ?? 0.2} />
          ))}
        </View>
      </View>
    </View>
  );
}
