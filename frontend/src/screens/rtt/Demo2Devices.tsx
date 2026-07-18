/**
 * Demo 2 — Danh sách thiết bị (rtt_hackathon.pen · "Demo 2 Danh sách thiết bị").
 *
 * Cùng backend LAN: hiện thiết bị của mình + các thiết bị khác đang online (từ
 * event `lobby`). Bấm "Mời" → gửi `invite`; nhận lời mời → sang Demo3; ghép được
 * phòng → sang Meeting.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, Languages, Laptop, Loader, UserPlus, Users } from 'lucide-react-native';

import { useResponsive } from '@/components/hooks';
import type { RttStackScreenProps } from '@/navigation/rttTypes';
import { useStore } from '@/store';
import type { Device, Lang } from '@/types/translator';

const TP = { accent: '#5EEAD4', text2: '#9AA0A6', muted: '#585E66', red: '#ff6669', black: '#000000' };

function langLabel(lang: Lang): string {
  return lang === 'vi' ? 'Tiếng Việt (VI)' : 'English (EN)';
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <View className="flex-row items-center gap-2 rounded-full border border-tp-border bg-tp-surface px-3.5 py-2">
      {children}
    </View>
  );
}

export function Demo2Devices({ navigation }: RttStackScreenProps<'Devices'>) {
  const { compact } = useResponsive();
  const insets = useSafeAreaInsets();
  const devices = useStore((s) => s.devices);
  const myName = useStore((s) => s.myName);
  const srcLang = useStore((s) => s.srcLang);
  const status = useStore((s) => s.translatorStatus);
  const pendingInviteTo = useStore((s) => s.pendingInviteTo);
  const incomingInvite = useStore((s) => s.incomingInvite);
  const room = useStore((s) => s.room);
  const translatorError = useStore((s) => s.translatorError);
  const invitePeer = useStore((s) => s.invitePeer);

  // Thiết bị đang chờ xác nhận mời khi cùng ngôn ngữ (mở popup cảnh báo), hoặc null.
  const [confirmDevice, setConfirmDevice] = useState<Device | null>(null);

  // Mời thiết bị: cùng ngôn ngữ với mình → mở popup cảnh báo trước; khác thì mời luôn.
  const requestInvite = (dev: Device) => {
    if (dev.lang === srcLang) setConfirmDevice(dev);
    else invitePeer(dev.clientId);
  };

  // Nhận lời mời đến → sang màn Lời mời (bên nhận).
  useEffect(() => {
    if (incomingInvite) navigation.navigate('Invite');
  }, [incomingInvite, navigation]);

  // Ghép phòng xong (dù mình mời hay được mời) → vào cuộc họp.
  useEffect(() => {
    if (room) navigation.navigate('Meeting');
  }, [room, navigation]);

  return (
    <View className="flex-1 bg-tp-bg" style={{ paddingTop: insets.top }}>
      {/* Top bar */}
      <View
        className={`flex-row flex-wrap items-center justify-between gap-y-2 border-b border-tp-border ${
          compact ? 'px-4 py-3' : 'px-8 py-5'
        }`}
      >
        <View className="flex-row items-center gap-2.5">
          <View className="h-[30px] w-[30px] items-center justify-center rounded-lg bg-tp-accent">
            <Languages size={18} color={TP.black} />
          </View>
          <Text className="text-xl font-bold text-tp-text">RTT</Text>
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          <Pill>
            <Users size={15} color={TP.accent} />
            <Text className="text-[13px] font-medium text-tp-text">
              {devices.length} thiết bị khác
            </Text>
          </Pill>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: compact ? 16 : 32,
          paddingBottom: (compact ? 16 : 32) + insets.bottom,
          gap: compact ? 16 : 24,
        }}
      >
        {/* Your device */}
        <View className="flex-row items-center justify-between rounded-2xl border border-tp-border bg-tp-surface p-5">
          <View className="flex-row items-center gap-3.5">
            <Laptop size={26} color={TP.accent} />
            <View className="gap-[3px]">
              <Text className="text-lg font-semibold text-tp-text">{myName}</Text>
              <Text className="text-[13px] text-tp-text2">
                Thiết bị của bạn · {langLabel(srcLang)}
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-2.5">
            <View className="rounded-full border border-tp-accent bg-tp-surface px-2.5 py-1">
              <Text className="text-xs font-semibold text-tp-accent">{srcLang.toUpperCase()}</Text>
            </View>
            <View
              className="h-[9px] w-[9px] rounded-full"
              style={{ backgroundColor: status === 'connected' ? TP.accent : TP.muted }}
            />
          </View>
        </View>

        {!!translatorError && (
          <View className="rounded-xl border px-4 py-3" style={{ borderColor: '#5a2a2e', backgroundColor: '#2a1518' }}>
            <Text className="text-sm" style={{ color: '#ff8a99' }}>
              {translatorError}
            </Text>
          </View>
        )}

        {/* Available head */}
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-semibold text-tp-text">Thiết bị khả dụng</Text>
          <View className="flex-row items-center gap-[7px]">
            <Loader size={14} color={TP.muted} />
            <Text className="text-[13px] text-tp-muted">
              {status === 'connected' ? 'Đang tìm thiết bị…' : 'Chưa kết nối'}
            </Text>
          </View>
        </View>

        {/* Device list */}
        {devices.length === 0 ? (
          <View className="items-center gap-2 rounded-[14px] border border-dashed border-tp-border bg-tp-surface p-8">
            <Text className="text-center text-[15px] text-tp-text2">
              Chưa thấy thiết bị nào khác.
            </Text>
            <Text className="text-center text-[13px] text-tp-muted">
              Mở app trên máy thứ hai và trỏ cùng WS URL để nó xuất hiện ở đây.
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {devices.map((dev) => {
              const waiting = pendingInviteTo === dev.clientId;
              // Cùng ngôn ngữ với mình → ghép cặp sẽ không có bản dịch. Cảnh báo.
              const sameLang = dev.lang === srcLang;
              return (
                <View
                  key={dev.clientId}
                  className="flex-row items-center justify-between rounded-[14px] border border-tp-border bg-tp-surface p-[18px]"
                >
                  <View className="flex-1 flex-row items-center gap-3.5">
                    <Laptop size={24} color={dev.busy ? TP.muted : TP.text2} />
                    <View className="flex-1 gap-[3px]">
                      <Text className="text-base font-semibold text-tp-text">{dev.name}</Text>
                      <Text className="text-xs text-tp-muted">Ngôn ngữ: {langLabel(dev.lang)}</Text>
                      {sameLang && !dev.busy && (
                        <View className="mt-0.5 flex-row items-center gap-1.5">
                          <AlertTriangle size={12} color={TP.red} />
                          <Text className="text-[11px]" style={{ color: '#ff8a99' }}>
                            Cùng ngôn ngữ với bạn — sẽ không có bản dịch
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {dev.busy ? (
                    <View className="rounded-full border border-tp-border bg-tp-surface px-5 py-2.5">
                      <Text className="text-sm text-tp-muted">Đang bận</Text>
                    </View>
                  ) : waiting ? (
                    <View className="flex-row items-center gap-2 rounded-full border border-tp-border bg-tp-surface px-5 py-2.5">
                      <Loader size={14} color={TP.text2} />
                      <Text className="text-sm text-tp-text2">Đang chờ…</Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => requestInvite(dev)}
                      disabled={status !== 'connected' || pendingInviteTo !== null}
                      className="flex-row items-center gap-2 rounded-full bg-tp-accent px-5 py-2.5"
                      style={{ opacity: status !== 'connected' || pendingInviteTo !== null ? 0.5 : 1 }}
                    >
                      <UserPlus size={15} color={TP.black} />
                      <Text className="text-sm font-semibold text-tp-bg">Mời</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Popup cảnh báo khi mời thiết bị cùng ngôn ngữ — vẫn cho tiếp tục mời. */}
      <Modal
        transparent
        visible={confirmDevice !== null}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setConfirmDevice(null)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/60 px-6"
          onPress={() => setConfirmDevice(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full max-w-md gap-4 rounded-2xl border border-tp-border bg-tp-surface p-6"
          >
            <View className="flex-row items-center gap-2.5">
              <AlertTriangle size={22} color={TP.red} />
              <Text className="text-lg font-semibold text-tp-text">Cùng ngôn ngữ</Text>
            </View>
            <Text className="text-[14px] leading-[20px] text-tp-text2">
              “{confirmDevice?.name}” đang dùng {confirmDevice ? langLabel(confirmDevice.lang) : ''},
              cùng ngôn ngữ với bạn. Nếu ghép cặp sẽ không có bản dịch. Bạn vẫn muốn tiếp tục mời?
            </Text>
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setConfirmDevice(null)}
                className="flex-1 items-center justify-center rounded-full border border-tp-border bg-tp-surface p-[13px]"
              >
                <Text className="text-[15px] font-medium text-tp-text">Huỷ</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (confirmDevice) invitePeer(confirmDevice.clientId);
                  setConfirmDevice(null);
                }}
                className="flex-1 items-center justify-center rounded-full bg-tp-accent p-[13px]"
              >
                <Text className="text-[15px] font-semibold text-tp-bg">Vẫn mời</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
