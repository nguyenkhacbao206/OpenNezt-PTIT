/**
 * Demo 6 — Đến lượt bạn nói (rtt_hackathon.pen · "Demo 6 Đến lượt bạn nói").
 *
 * Bạn đang nói: bản dịch của bạn hiện lớn ở giữa; chip "đã nghe" (câu đối tác vừa
 * nói) và ô "đã nói" (chờ câu của bạn) ở hai bên. Chạm để xem lịch sử. Chỉ UI.
 */
import { Pressable, Text, View } from 'react-native';
import { EyeOff, Lock, Mic } from 'lucide-react-native';

import type { RttStackScreenProps } from '@/navigation/rttTypes';

const TP = { accent: '#5EEAD4', text2: '#9AA0A6', muted: '#585E66' };
const WAVE = [10, 18, 24, 14, 22, 26, 16, 20, 12];

export function Demo6YourTurn({ navigation }: RttStackScreenProps<'YourTurn'>) {
  return (
    <Pressable className="flex-1 bg-tp-bg" onPress={() => navigation.navigate('History')}>
      {/* Top bar */}
      <View className="flex-row items-center justify-between px-8 py-[18px]">
        <View className="flex-row items-center gap-2 rounded-full border border-tp-border bg-tp-surface px-3.5 py-2">
          <Lock size={14} color={TP.accent} />
          <Text className="text-[13px] font-semibold tracking-[1px] text-tp-text">OFFLINE</Text>
        </View>
        <Text className="text-[15px] font-medium tracking-[1px] text-tp-text2">EN sang VI</Text>
        <View className="flex-row items-center gap-2">
          <View className="h-2 w-2 rounded-full bg-tp-accent" />
          <Text className="text-[13px] text-tp-text2">On-device</Text>
        </View>
      </View>

      {/* Body */}
      <View className="flex-1 items-center justify-center px-16">
        {/* Heard chip — top left */}
        <View
          className="absolute left-8 top-4 w-[370px] gap-2.5 rounded-2xl border border-tp-border bg-tp-surface p-[18px]"
          style={{ opacity: 0.8 }}
        >
          <Text className="text-[11px] font-semibold tracking-[1.5px] text-tp-accent">ĐÃ NGHE</Text>
          <Text className="text-[17px] leading-[23px] text-tp-text">
            Chúng tôi đề xuất 2,5 triệu đô cho 18 tháng đầu.
          </Text>
          <Text className="text-xs leading-[16px] text-tp-muted">
            We&apos;re proposing 2.5M for the first 18 months.
          </Text>
        </View>

        {/* Live speaking — center */}
        <View className="items-center gap-6" style={{ maxWidth: 1000 }}>
          <View className="flex-row items-center gap-3">
            <Mic size={18} color={TP.accent} />
            <Text className="text-sm font-semibold tracking-[2px] text-tp-accent">BẠN ĐANG NÓI</Text>
            <View className="h-[26px] flex-row items-center gap-[3px]">
              {WAVE.map((h, i) => (
                <View key={i} className="w-[3px] rounded-full bg-tp-accent" style={{ height: h }} />
              ))}
            </View>
          </View>
          <Text className="text-center text-[50px] font-semibold leading-[58px] text-tp-text">
            Vâng, con số đó nằm trong ngân sách của chúng tôi.
          </Text>
          <Text className="text-center text-xl text-tp-text2">
            Gốc: Yes, that number is within our budget.
          </Text>
        </View>

        {/* Empty slot — bottom right */}
        <View
          className="absolute bottom-10 right-8 h-[140px] w-[378px] justify-center gap-2.5 rounded-2xl border border-tp-border bg-tp-surface p-5"
          style={{ opacity: 0.4 }}
        >
          <Text className="text-[11px] font-semibold tracking-[1.5px] text-tp-muted">ĐÃ NÓI</Text>
          <Text className="text-xs leading-[17px] text-tp-muted">
            Câu trả lời của bạn sẽ dạt về đây khi nói xong.
          </Text>
        </View>

        {/* Hide button — bottom left */}
        <View className="absolute bottom-10 left-8 flex-row items-center gap-2 rounded-full border border-tp-border bg-tp-surface px-4 py-2.5">
          <EyeOff size={16} color={TP.text2} />
          <Text className="text-sm text-tp-text2">Ẩn hội thoại</Text>
        </View>
      </View>
    </Pressable>
  );
}
