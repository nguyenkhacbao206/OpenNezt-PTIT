/**
 * Demo 1 — Chọn ngôn ngữ (theo rtt_hackathon.pen · frame "Demo 1 Chọn ngôn ngữ").
 *
 * Lần đầu mở app: người dùng chọn ngôn ngữ mặc định (lưu trên thiết bị). Chỉ UI,
 * chưa gắn logic — `onContinue` điều hướng sang bước kế.
 */
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Globe, Languages, Server } from 'lucide-react-native';

import type { RttStackScreenProps } from '@/navigation/rttTypes';
import { useStore } from '@/store';

interface LangOption {
  code: string;
  name: string;
  native: string;
}

const LANGS: LangOption[] = [
  { code: 'vi', name: 'Tiếng Việt', native: 'Vietnamese' },
  { code: 'en', name: 'English', native: 'English' },
  { code: 'ja', name: '日本語', native: 'Japanese' },
  { code: 'zh', name: '中文', native: 'Chinese' },
  { code: 'ko', name: '한국어', native: 'Korean' },
];

export function Demo1Language({ navigation }: RttStackScreenProps<'Language'>) {
  const [selected, setSelected] = useState('vi');
  const [showAdv, setShowAdv] = useState(false);
  const setLangs = useStore((s) => s.setLangs);
  const wsUrl = useStore((s) => s.wsUrl);
  const setWsUrl = useStore((s) => s.setWsUrl);
  const myName = useStore((s) => s.myName);
  const setMyName = useStore((s) => s.setMyName);
  const enterLobby = useStore((s) => s.enterLobby);

  const onContinue = () => {
    // Ngôn ngữ của mình = nguồn; đối tác nhận ngôn ngữ còn lại. Backend hỗ trợ
    // vi/en → gộp các ngôn ngữ khác về "en" cho demo.
    const src = selected === 'vi' ? 'vi' : 'en';
    setLangs(src, src === 'vi' ? 'en' : 'vi');
    // Kết nối tới backend LAN và vào lobby ngay, để danh sách thiết bị hiện ở
    // bước sau (Demo2) trong khi vẫn thấy tiến trình kết nối.
    enterLobby((myName || '').trim() || 'Thiết bị của tôi');
    navigation.navigate('Devices');
  };

  return (
    <View className="flex-1 bg-tp-bg">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 36 }}
      >
        {/* Wordmark */}
        <View className="flex-row items-center gap-2.5">
          <View className="h-[30px] w-[30px] items-center justify-center rounded-lg bg-tp-accent">
            <Languages size={18} color="#000000" />
          </View>
          <Text className="text-xl font-bold text-tp-text">RTT</Text>
        </View>

        {/* Card */}
        <View
          className="w-full max-w-[560px] gap-6 rounded-[20px] border border-tp-border bg-tp-surface p-10"
        >
          <View className="gap-2">
            <Text className="text-[28px] font-semibold text-tp-text">Chọn ngôn ngữ của bạn</Text>
            <Text className="text-[15px] leading-[21px] text-tp-text2">
              Ngôn ngữ này được lưu trên thiết bị và dùng làm mặc định cho các phiên họp.
            </Text>
          </View>

          {/* Tên thiết bị — hiển thị cho người khác trong lobby */}
          <View className="gap-1.5">
            <Text className="text-[13px] font-medium text-tp-text2">Tên thiết bị của bạn</Text>
            <TextInput
              value={myName}
              onChangeText={setMyName}
              autoCapitalize="words"
              autoCorrect={false}
              placeholder="VD: MacBook của Linh"
              placeholderTextColor="#585E66"
              className="rounded-xl border border-tp-border bg-tp-bg px-4 py-3 text-base text-tp-text"
            />
          </View>

          <View className="gap-2.5">
            {LANGS.map((lang) => {
              const active = selected === lang.code;
              return (
                <Pressable
                  key={lang.code}
                  onPress={() => setSelected(lang.code)}
                  className={`flex-row items-center justify-between rounded-xl bg-tp-bg p-4 ${
                    active ? 'border-[1.5px] border-tp-accent' : 'border border-tp-border'
                  }`}
                >
                  <View className="flex-row items-center gap-3">
                    <Globe size={20} color={active ? '#5EEAD4' : '#9AA0A6'} />
                    <View className="gap-0.5">
                      <Text className="text-base font-semibold text-tp-text">{lang.name}</Text>
                      <Text className="text-[13px] text-tp-muted">{lang.native}</Text>
                    </View>
                  </View>
                  <View
                    className={`h-5 w-5 items-center justify-center rounded-full ${
                      active ? 'border-2 border-tp-accent' : 'border-[1.5px] border-tp-border'
                    }`}
                  >
                    {active && <View className="h-2.5 w-2.5 rounded-full bg-tp-accent" />}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={onContinue}
            className="items-center justify-center rounded-full bg-tp-accent p-[15px]"
          >
            <Text className="text-base font-semibold text-tp-bg">Tiếp tục</Text>
          </Pressable>

          <Text className="text-center text-[13px] text-tp-muted">Có thể đổi lại trong Cài đặt.</Text>

          {/* Cài đặt backend (WS URL) — cần khi chạy trên thiết bị LAN */}
          <Pressable
            onPress={() => setShowAdv((v) => !v)}
            className="mt-1 flex-row items-center justify-center gap-1.5"
          >
            <Server size={13} color="#585E66" />
            <Text className="text-center text-[12px] text-tp-muted">
              {showAdv ? 'Ẩn cài đặt backend' : 'Cài đặt backend'}
            </Text>
          </Pressable>
          {showAdv && (
            <View className="gap-1.5">
              <Text className="text-[11px] text-tp-muted">
                WebSocket URL (thiết bị thật: dùng IP LAN, vd ws://192.168.1.x:8000/ws)
              </Text>
              <TextInput
                value={wsUrl}
                onChangeText={setWsUrl}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="ws://localhost:8000/ws"
                placeholderTextColor="#585E66"
                className="rounded-lg border border-tp-border bg-tp-bg px-3 py-2 text-sm text-tp-text"
              />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
