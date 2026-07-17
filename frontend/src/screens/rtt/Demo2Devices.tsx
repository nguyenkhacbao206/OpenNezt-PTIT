/**
 * Demo 2 — Danh sách thiết bị (rtt_hackathon.pen · "Demo 2 Danh sách thiết bị").
 *
 * Cùng mạng LAN: hiện thiết bị của mình (đổi tên được) + danh sách thiết bị khả
 * dụng để gửi lời mời kết nối. Chỉ UI.
 */
import type { ComponentType } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  Languages,
  Laptop,
  Loader,
  Monitor,
  Pencil,
  type LucideProps,
  Smartphone,
  Tablet,
  UserPlus,
  Users,
  Wifi,
} from 'lucide-react-native';

import type { RttStackScreenProps } from '@/navigation/rttTypes';

const TP = { accent: '#5EEAD4', text2: '#9AA0A6', muted: '#585E66', black: '#000000' };

interface Device {
  name: string;
  lang: string;
  icon: ComponentType<LucideProps>;
  pending?: boolean;
}

const DEVICES: Device[] = [
  { name: 'David’s iPad', lang: 'Ngôn ngữ: English (EN)', icon: Tablet, pending: true },
  { name: 'Kenji (Pixel 8)', lang: 'Ngôn ngữ: 日本語 (JA)', icon: Smartphone },
  { name: 'Meeting Room TV', lang: 'Ngôn ngữ: English (EN)', icon: Monitor },
  { name: 'Sarah’s ThinkPad', lang: 'Ngôn ngữ: English (EN)', icon: Laptop },
  { name: 'Minh (iPhone)', lang: 'Ngôn ngữ: Tiếng Việt (VI)', icon: Smartphone },
];

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-2 rounded-full border border-tp-border bg-tp-surface px-3.5 py-2">
      {children}
    </View>
  );
}

export function Demo2Devices({ navigation }: RttStackScreenProps<'Devices'>) {
  return (
    <View className="flex-1 bg-tp-bg">
      {/* Top bar */}
      <View className="flex-row items-center justify-between border-b border-tp-border px-8 py-5">
        <View className="flex-row items-center gap-2.5">
          <View className="h-[30px] w-[30px] items-center justify-center rounded-lg bg-tp-accent">
            <Languages size={18} color={TP.black} />
          </View>
          <Text className="text-xl font-bold text-tp-text">RTT</Text>
        </View>
        <View className="flex-row items-center gap-4">
          <Pill>
            <Wifi size={15} color={TP.accent} />
            <Text className="text-[13px] text-tp-text2">Cùng mạng: Office-5F</Text>
          </Pill>
          <Pill>
            <Users size={15} color={TP.accent} />
            <Text className="text-[13px] font-medium text-tp-text">5 người trong phòng</Text>
          </Pill>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 32, gap: 24 }}>
        {/* Your device */}
        <View className="flex-row items-center justify-between rounded-2xl border border-tp-border bg-tp-surface p-5">
          <View className="flex-row items-center gap-3.5">
            <Laptop size={26} color={TP.accent} />
            <View className="gap-[3px]">
              <View className="flex-row items-center gap-2">
                <Text className="text-lg font-semibold text-tp-text">Linh’s MacBook</Text>
                <Pencil size={15} color={TP.text2} />
              </View>
              <Text className="text-[13px] text-tp-text2">Thiết bị của bạn, Ngôn ngữ: Tiếng Việt</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-2.5">
            <View className="rounded-full border border-tp-accent bg-tp-surface px-2.5 py-1">
              <Text className="text-xs font-semibold text-tp-accent">VI</Text>
            </View>
            <View className="h-[9px] w-[9px] rounded-full bg-tp-accent" />
          </View>
        </View>

        {/* Available head */}
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-semibold text-tp-text">Thiết bị khả dụng</Text>
          <View className="flex-row items-center gap-[7px]">
            <Loader size={14} color={TP.muted} />
            <Text className="text-[13px] text-tp-muted">Đang quét mạng...</Text>
          </View>
        </View>

        {/* Device list */}
        <View className="gap-3">
          {DEVICES.map((dev) => {
            const Icon = dev.icon;
            return (
              <View
                key={dev.name}
                className="flex-row items-center justify-between rounded-[14px] border border-tp-border bg-tp-surface p-[18px]"
              >
                <View className="flex-row items-center gap-3.5">
                  <Icon size={24} color={TP.text2} />
                  <View className="gap-[3px]">
                    <Text className="text-base font-semibold text-tp-text">{dev.name}</Text>
                    <Text className="text-xs text-tp-muted">{dev.lang}</Text>
                  </View>
                </View>
                {dev.pending ? (
                  <View className="flex-row items-center gap-2 rounded-full border border-tp-border bg-tp-surface px-5 py-2.5">
                    <Loader size={14} color={TP.text2} />
                    <Text className="text-sm text-tp-text2">Đang chờ...</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => navigation.navigate('Invite')}
                    className="flex-row items-center gap-2 rounded-full bg-tp-accent px-5 py-2.5"
                  >
                    <UserPlus size={15} color={TP.black} />
                    <Text className="text-sm font-semibold text-tp-bg">Mời</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
