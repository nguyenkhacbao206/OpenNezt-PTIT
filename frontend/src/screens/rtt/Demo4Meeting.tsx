/**
 * Demo 4 — Trong cuộc họp (rtt_hackathon.pen · "Demo 4 Trong cuộc họp").
 *
 * Màn chính của phiên. Kết nối backend khi vào; hiển thị bản dịch gần nhất (hoặc
 * bản dịch tạm đang chạy). PTT → sang màn "Đến lượt bạn nói" để thu + dịch live.
 */
import { useEffect, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, History, Mic, PhoneOff, Volume2, VolumeX } from 'lucide-react-native';

import type { RttStackScreenProps } from '@/navigation/rttTypes';
import { useStore } from '@/store';

const TP = { accent: '#5EEAD4', text2: '#9AA0A6', muted: '#585E66', red: '#ff6669', black: '#000000' };
const WAVE = [8, 16, 11, 20, 9, 15, 7];
const STATUS_LABEL: Record<string, string> = {
  disconnected: 'Chưa kết nối',
  connecting: 'Đang kết nối…',
  connected: 'Đang họp',
  error: 'Lỗi kết nối',
};

export function Demo4Meeting({ navigation }: RttStackScreenProps<'Meeting'>) {
  const status = useStore((s) => s.translatorStatus);
  const live = useStore((s) => s.live);
  const turns = useStore((s) => s.turns);
  const srcLang = useStore((s) => s.srcLang);
  const dstLang = useStore((s) => s.dstLang);
  const room = useStore((s) => s.room);
  const ttsOn = useStore((s) => s.ttsOn);
  const setTtsOn = useStore((s) => s.setTtsOn);
  const leaveRoom = useStore((s) => s.leaveRoom);

  // Đối tác rời/mất kết nối (room bị đóng nhưng mình vẫn online) → về lobby.
  useEffect(() => {
    if (!room && status === 'connected') navigation.navigate('Devices');
  }, [room, status, navigation]);

  // Nghe: đối tác đang nói → bản dịch TẠM (live). Đối tác nói xong → bản dịch
  // GẦN NHẤT dạng card gọn ở góc; chạm để mở Lịch sử.
  const shown = live;
  const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
  const dotColor = status === 'connected' ? TP.accent : status === 'error' ? TP.red : TP.muted;
  const peerName = room?.peer.name ?? 'Đối tác';
  const partsLabel = useMemo(
    () => `Bạn (${srcLang.toUpperCase()}) ⇄ ${peerName} (${dstLang.toUpperCase()})`,
    [srcLang, dstLang, peerName],
  );

  const endMeeting = () => {
    leaveRoom();
    navigation.navigate('EndSession');
  };

  return (
    <View className="flex-1 bg-tp-bg">
      {/* Top bar */}
      <View className="flex-row items-center justify-between border-b border-tp-border px-8 py-[18px]">
        <View className="flex-row items-center gap-2.5">
          <View className="h-[9px] w-[9px] rounded-full" style={{ backgroundColor: dotColor }} />
          <Text className="text-[15px] font-medium text-tp-text">{STATUS_LABEL[status] ?? status}</Text>
        </View>
        <Text className="text-[15px] text-tp-text2">{partsLabel}</Text>
        <Pressable
          onPress={endMeeting}
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
            <Text className="text-sm text-tp-text">{dstLang === 'vi' ? 'Tiếng Việt' : 'English'}</Text>
            <ChevronDown size={15} color={TP.text2} />
          </View>
        </View>
        <View className="flex-row items-center gap-4">
          <Pressable
            onPress={() => setTtsOn(!ttsOn)}
            className="flex-row items-center gap-2 rounded-full border border-tp-border bg-tp-surface px-3.5 py-2"
          >
            {ttsOn ? <Volume2 size={15} color={TP.accent} /> : <VolumeX size={15} color={TP.muted} />}
            <Text className="text-sm" style={{ color: ttsOn ? TP.accent : TP.muted }}>
              {ttsOn ? 'Đọc: Bật' : 'Đọc: Tắt'}
            </Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('History')} className="flex-row items-center gap-[7px]">
            <History size={15} color={TP.text2} />
            <Text className="text-sm text-tp-text2">Lịch sử</Text>
          </Pressable>
        </View>
      </View>

      {/* Main */}
      <View className="flex-1 px-16 py-8">
        {/* Card "bản dịch gần nhất" — góc TRÊN-TRÁI, nhỏ gọn */}
        {!shown && lastTurn && (
          <Pressable
            onPress={() => navigation.navigate('History')}
            className="absolute left-8 top-4 w-[300px] gap-1.5 rounded-xl border border-tp-border bg-tp-surface p-3.5"
          >
            <Text className="text-[10px] font-semibold tracking-[1.5px] text-tp-accent">
              BẢN DỊCH GẦN NHẤT
            </Text>
            <Text
              className="text-[15px] font-medium leading-[20px] text-tp-text"
              numberOfLines={3}
            >
              {lastTurn.dstText}
            </Text>
            <Text className="text-[11px] leading-[15px] text-tp-muted" numberOfLines={1}>
              Gốc: {lastTurn.srcText}
            </Text>
            <Text className="text-[11px] text-tp-text2">Chạm để xem ở Lịch sử →</Text>
          </Pressable>
        )}

        {/* GIỮA */}
        <View className="flex-1 items-center justify-center gap-5">
          {shown ? (
            <>
              <View className="flex-row items-center gap-3">
                <Text className="text-[13px] font-semibold tracking-[2px] text-tp-accent">
                  ĐANG DỊCH
                </Text>
                <View className="flex-row items-center gap-1.5">
                  <Volume2 size={16} color={TP.accent} />
                  <View className="h-[22px] flex-row items-end gap-[3px]">
                    {WAVE.map((h, i) => (
                      <View key={i} className="w-[3px] rounded-sm bg-tp-accent" style={{ height: h }} />
                    ))}
                  </View>
                </View>
              </View>
              <View
                style={{ maxHeight: 300, overflow: 'hidden', maxWidth: 1000 }}
                className="items-center"
              >
                <Text className="text-center text-[46px] font-semibold leading-[55px] text-tp-text">
                  {shown.dstText || '…'}
                </Text>
              </View>
              {!!shown.srcText && (
                <Text
                  className="text-center text-lg text-tp-text2"
                  numberOfLines={2}
                  style={{ maxWidth: 800 }}
                >
                  Gốc: {shown.srcText}
                </Text>
              )}
            </>
          ) : (
            <View className="items-center gap-4">
              <Text className="text-center text-lg text-tp-muted" style={{ maxWidth: 720 }}>
                {status === 'connected'
                  ? `Đã ghép với ${peerName}. Khi ${peerName} nói, bản dịch + giọng đọc hiện ở đây; nhấn “Nhấn để nói” để tới lượt bạn.`
                  : 'Mất kết nối phòng. Quay lại danh sách thiết bị để ghép lại.'}
              </Text>
              {status !== 'connected' && (
                <Pressable
                  onPress={() => navigation.navigate('Devices')}
                  className="rounded-full bg-tp-accent px-6 py-3"
                >
                  <Text className="text-base font-semibold text-tp-bg">Về danh sách thiết bị</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>

      {/* PTT bar */}
      <View className="items-center gap-3 border-t border-tp-border px-8 py-6">
        <Pressable
          onPress={() => navigation.navigate('YourTurn')}
          disabled={status !== 'connected'}
          className="flex-row items-center justify-center gap-3 rounded-full px-12 py-5"
          style={{ backgroundColor: status === 'connected' ? TP.accent : TP.muted }}
        >
          <Mic size={24} color={TP.black} />
          <Text className="text-lg font-bold text-tp-bg">Nhấn để nói</Text>
        </Pressable>
        <Text className="text-[13px] text-tp-muted">
          Thu âm → ASR → Dịch → TTS. Bản dịch tạm hiện ngay khi bạn đang nói.
        </Text>
      </View>
    </View>
  );
}
