/**
 * Demo 8 — Kết thúc phiên (rtt_hackathon.pen · "Demo 8 Kết thúc phiên").
 *
 * Tổng kết phiên: thời lượng / số câu / người tham gia, và nút quay lại danh sách
 * thiết bị hoặc xuất bản ghi. Chỉ UI.
 */
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CheckCheck, Download, List } from 'lucide-react-native';

import type { RttStackScreenProps } from '@/navigation/rttTypes';
import { useStore } from '@/store';

const TP = { accent: '#5EEAD4', text2: '#9AA0A6', black: '#000000' };

export function Demo8EndSession({ navigation }: RttStackScreenProps<'EndSession'>) {
  const turns = useStore((s) => s.turns);
  const clearTurns = useStore((s) => s.clearTurns);

  const STATS = [
    { value: '—', label: 'Thời lượng' },
    { value: String(turns.length), label: 'Câu đã dịch' },
    { value: '2', label: 'Người tham gia' },
  ];

  const backToDevices = () => {
    clearTurns();
    navigation.navigate('Devices');
  };

  return (
    <View className="flex-1 bg-tp-bg">
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <View className="w-full max-w-[620px] items-center gap-7 rounded-[20px] border border-tp-border bg-tp-surface p-12">
          <View className="h-[88px] w-[88px] items-center justify-center rounded-full border-[1.5px] border-tp-accent bg-tp-bg">
            <CheckCheck size={44} color={TP.accent} />
          </View>

          <View className="items-center gap-2">
            <Text className="text-center text-[28px] font-semibold text-tp-text">Phiên họp đã kết thúc</Text>
            <Text className="text-center text-[15px] leading-[21px] text-tp-text2">
              Với David’s iPad. Đã lưu bản ghi trên thiết bị của bạn.
            </Text>
          </View>

          <View className="w-full flex-row gap-3">
            {STATS.map((s) => (
              <View
                key={s.label}
                className="flex-1 items-center gap-1.5 rounded-[14px] border border-tp-border bg-tp-bg p-[18px]"
              >
                <Text className="text-2xl font-bold text-tp-text">{s.value}</Text>
                <Text className="text-center text-xs text-tp-muted">{s.label}</Text>
              </View>
            ))}
          </View>

          <View className="w-full gap-3">
            <Pressable
              onPress={backToDevices}
              className="w-full flex-row items-center justify-center gap-2 rounded-full bg-tp-accent p-[15px]"
            >
              <List size={18} color={TP.black} />
              <Text className="text-base font-semibold text-tp-bg">Quay lại danh sách thiết bị</Text>
            </Pressable>
            <View className="w-full flex-row items-center justify-center gap-2 rounded-full border border-tp-border bg-tp-surface p-[15px]">
              <Download size={17} color={TP.text2} />
              <Text className="text-[15px] font-medium text-tp-text">Xuất bản ghi (.txt)</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
