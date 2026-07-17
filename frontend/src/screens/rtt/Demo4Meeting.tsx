/**
 * Demo 4 — Trong cuộc họp (rtt_hackathon.pen · "Demo 4 Trong cuộc họp").
 *
 * Màn chính của phiên: đối tác đang nói → bản dịch lớn giữa màn + câu gốc, TTS
 * đang phát, dưới cùng là nút Push-to-Talk để tới lượt mình. Chỉ UI.
 */
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, History, Mic, PhoneOff, Volume2 } from 'lucide-react-native';

import type { RttStackScreenProps } from '@/navigation/rttTypes';

const TP = { accent: '#5EEAD4', text2: '#9AA0A6', muted: '#585E66', red: '#ff6669', black: '#000000' };
const WAVE = [8, 16, 11, 20, 9, 15, 7];

export function Demo4Meeting({ navigation }: RttStackScreenProps<'Meeting'>) {
  return (
    <View className="flex-1 bg-tp-bg">
      {/* Top bar */}
      <View className="flex-row items-center justify-between border-b border-tp-border px-8 py-[18px]">
        <View className="flex-row items-center gap-2.5">
          <View className="h-[9px] w-[9px] rounded-full" style={{ backgroundColor: TP.red }} />
          <Text className="text-[15px] font-medium text-tp-text">Phiên họp 00:12:45</Text>
        </View>
        <Text className="text-[15px] text-tp-text2">Bạn (VI) và David (EN)</Text>
        <Pressable
          onPress={() => navigation.navigate('EndSession')}
          className="flex-row items-center gap-2 rounded-full bg-tp-surface px-[18px] py-[9px]"
          style={{ borderWidth: 1, borderColor: '#E7000B' }}
        >
          <PhoneOff size={15} color={TP.red} />
          <Text className="text-sm font-medium" style={{ color: TP.red }}>
            Kết thúc
          </Text>
        </Pressable>
      </View>

      {/* Toolbar */}
      <View className="flex-row items-center justify-between px-8 py-3.5">
        <View className="flex-row items-center gap-2.5">
          <Text className="text-[13px] text-tp-muted">Ngôn ngữ nhận</Text>
          <View className="flex-row items-center gap-2 rounded-full border border-tp-border bg-tp-surface px-4 py-2">
            <Text className="text-sm text-tp-text">Tiếng Việt</Text>
            <ChevronDown size={15} color={TP.text2} />
          </View>
        </View>
        <Pressable onPress={() => navigation.navigate('History')} className="flex-row items-center gap-[7px]">
          <History size={15} color={TP.text2} />
          <Text className="text-sm text-tp-text2">Lịch sử</Text>
        </Pressable>
      </View>

      {/* Main */}
      <View className="flex-1 items-center justify-center gap-5 px-16 py-8">
        <View className="flex-row items-center gap-3">
          <Text className="text-[13px] font-semibold tracking-[2px] text-tp-accent">DAVID ĐANG NÓI</Text>
          <View className="flex-row items-center gap-1.5">
            <Volume2 size={16} color={TP.accent} />
            <View className="h-[22px] flex-row items-end gap-[3px]">
              {WAVE.map((h, i) => (
                <View key={i} className="w-[3px] rounded-sm bg-tp-accent" style={{ height: h }} />
              ))}
            </View>
          </View>
        </View>

        <Text
          className="text-center text-[46px] font-semibold leading-[55px] text-tp-text"
          style={{ maxWidth: 1000 }}
        >
          Vâng, con số đó nằm trong ngân sách của chúng tôi.
        </Text>
        <Text className="text-center text-lg text-tp-text2" style={{ maxWidth: 800 }}>
          Gốc: Yes, that number is within our budget.
        </Text>
      </View>

      {/* PTT bar */}
      <View className="items-center gap-3 border-t border-tp-border px-8 py-6">
        <Pressable
          onPress={() => navigation.navigate('YourTurn')}
          className="flex-row items-center justify-center gap-3 rounded-full bg-tp-accent px-12 py-5"
        >
          <Mic size={24} color={TP.black} />
          <Text className="text-lg font-bold text-tp-bg">Nhấn giữ để nói</Text>
        </Pressable>
        <Text className="text-[13px] text-tp-muted">
          Giữ nút để ghi âm, rồi ASR, Dịch, TTS và gửi cho David.
        </Text>
      </View>
    </View>
  );
}
