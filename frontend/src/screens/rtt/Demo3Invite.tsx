/**
 * Demo 3 — Lời mời kết nối (rtt_hackathon.pen · "Demo 3 Lời mời kết nối").
 *
 * Sau khi bấm "Mời": hiển thị đối xứng phía gửi (đang chờ) và phía nhận (chấp
 * nhận / từ chối). Chấp nhận → tạo phiên họp (Demo 4). Chỉ UI.
 */
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Check, Laptop, Loader, Tablet } from 'lucide-react-native';

import type { RttStackScreenProps } from '@/navigation/rttTypes';

const TP = { accent: '#5EEAD4', text2: '#9AA0A6', black: '#000000' };

function Circle({ children }: { children: React.ReactNode }) {
  return (
    <View className="h-20 w-20 items-center justify-center rounded-full border-[1.5px] border-tp-accent bg-tp-bg">
      {children}
    </View>
  );
}

export function Demo3Invite({ navigation }: RttStackScreenProps<'Invite'>) {
  return (
    <View className="flex-1 bg-tp-bg">
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 40 }}>
        <Text className="text-2xl font-semibold text-tp-text">Lời mời kết nối</Text>

        <View className="w-full max-w-[1080px] flex-row flex-wrap justify-center gap-10">
          {/* Sender */}
          <View className="w-[520px] max-w-full items-center gap-5 rounded-[20px] border border-tp-border bg-tp-surface p-9">
            <Text className="text-[11px] font-semibold tracking-[1.5px] text-tp-muted">PHÍA GỬI</Text>
            <Circle>
              <Tablet size={36} color={TP.accent} />
            </Circle>
            <Text className="text-xl font-semibold text-tp-text">David’s iPad</Text>
            <View className="flex-row items-center gap-2">
              <Loader size={16} color={TP.accent} />
              <Text className="text-[15px] text-tp-text2">Đang chờ chấp nhận...</Text>
            </View>
            <Pressable
              onPress={() => navigation.goBack()}
              className="w-full items-center justify-center rounded-full border border-tp-border bg-tp-surface p-[13px]"
            >
              <Text className="text-[15px] font-medium text-tp-text">Hủy</Text>
            </Pressable>
          </View>

          {/* Receiver */}
          <View className="w-[520px] max-w-full items-center gap-5 rounded-[20px] border border-tp-border bg-tp-surface p-9">
            <Text className="text-[11px] font-semibold tracking-[1.5px] text-tp-muted">PHÍA NHẬN</Text>
            <Circle>
              <Laptop size={36} color={TP.accent} />
            </Circle>
            <Text className="text-center text-xl font-semibold leading-[26px] text-tp-text">
              “Linh’s MacBook” muốn kết nối
            </Text>
            <Text className="text-sm text-tp-text2">Ngôn ngữ: Tiếng Việt (VI)</Text>
            <View className="w-full flex-row gap-3">
              <Pressable
                onPress={() => navigation.goBack()}
                className="flex-1 items-center justify-center rounded-full border border-tp-border bg-tp-surface p-[13px]"
              >
                <Text className="text-[15px] font-medium text-tp-text">Từ chối</Text>
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate('Meeting')}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-full bg-tp-accent p-[13px]"
              >
                <Check size={16} color={TP.black} />
                <Text className="text-[15px] font-semibold text-tp-bg">Chấp nhận</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
