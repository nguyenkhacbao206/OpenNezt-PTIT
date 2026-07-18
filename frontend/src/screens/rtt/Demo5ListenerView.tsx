/**
 * Demo 5 — Người nghe thấy bản dịch (rtt_hackathon.pen · "Demo 5 ...").
 *
 * Góc nhìn phía nhận: bản dịch hiển thị cực lớn toàn màn hình + câu gốc, dải dưới
 * báo đang đọc to (TTS). Chạm để tiếp tục demo. Chỉ UI.
 */
import { Pressable, Text, View } from 'react-native';
import { Lock, Volume2 } from 'lucide-react-native';

import type { RttStackScreenProps } from '@/navigation/rttTypes';

const TP = { accent: '#5EEAD4', text2: '#9AA0A6', muted: '#585E66' };

export function Demo5ListenerView({ navigation }: RttStackScreenProps<'ListenerView'>) {
  return (
    <Pressable className="flex-1 bg-tp-bg" onPress={() => navigation.navigate('YourTurn')}>
      {/* Top bar */}
      <View className="flex-row items-center justify-between px-8 py-[18px]">
        <View className="flex-row items-center gap-[7px] rounded-full border border-tp-border bg-tp-surface px-3.5 py-[7px]">
          <Lock size={15} color={TP.accent} />
          <Text className="text-[13px] font-medium text-tp-text">OFFLINE</Text>
        </View>
        <Text className="text-[15px] font-medium text-tp-text2">EN sang VI</Text>
        <View className="flex-row items-center gap-3">
          <Text className="text-[13px] font-semibold text-tp-accent">● LIVE</Text>
          <View className="h-[9px] w-[9px] rounded-full bg-tp-accent" />
        </View>
      </View>

      {/* Hero */}
      <View className="flex-1 items-center justify-center gap-7 px-24 py-10">
        <Text className="text-sm font-semibold tracking-[2px] text-tp-accent">ĐANG NGHE</Text>
        <Text
          className="text-center text-[64px] font-semibold leading-[74px] text-tp-text"
          style={{ maxWidth: 1000 }}
        >
          Chúng tôi đề xuất 2,5 triệu đô cho 18 tháng đầu.
        </Text>
        <View className="items-center gap-2.5">
          <Text className="text-xl text-tp-muted">gốc</Text>
          <Text className="text-center text-2xl text-tp-text2" style={{ maxWidth: 760 }}>
            We&apos;re proposing 2.5 million dollars for the first 18 months.
          </Text>
        </View>
      </View>

      {/* Speaking strip */}
      <View className="flex-row items-center justify-center gap-3.5 border-t border-tp-border bg-tp-surface px-8 py-4">
        <Volume2 size={18} color={TP.accent} />
        <Text className="text-[15px] text-tp-text2">Đang đọc to bản dịch...</Text>
      </View>
    </Pressable>
  );
}
