/**
 * Demo 7 — Lịch sử dịch (rtt_hackathon.pen · "Demo 7 Lịch sử dịch").
 *
 * Xem lại toàn bộ câu đã dịch trong phiên: bong bóng trái (đối tác) / phải (bạn,
 * viền teal), mỗi câu có bản dịch + câu gốc + nút phát lại. Chỉ UI.
 */
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ArrowLeft, Download, Volume2 } from 'lucide-react-native';

import type { RttStackScreenProps } from '@/navigation/rttTypes';

const TP = { text2: '#9AA0A6', muted: '#585E66' };

interface Turn {
  speaker: string;
  lang: string;
  time: string;
  trans: string;
  orig: string;
  me?: boolean;
}

const TURNS: Turn[] = [
  { speaker: 'David', lang: 'EN', time: '12:02', trans: 'Chúng tôi đề xuất 2,5 triệu đô cho 18 tháng đầu.', orig: 'Gốc: We’re proposing 2.5 million dollars for the first 18 months.' },
  { speaker: 'Bạn', lang: 'VI', time: '12:03', trans: 'Vâng, con số đó nằm trong ngân sách của chúng tôi.', orig: 'Gốc: Yes, that number is within our budget.', me: true },
  { speaker: 'David', lang: 'EN', time: '12:04', trans: 'Chúng ta có thể bàn về tiến độ giao hàng không?', orig: 'Gốc: Can we discuss the delivery timeline?' },
  { speaker: 'Bạn', lang: 'VI', time: '12:05', trans: 'Tất nhiên, tôi sẽ chia sẻ lộ trình chi tiết.', orig: 'Gốc: Of course, I’ll share the detailed roadmap.', me: true },
  { speaker: 'David', lang: 'EN', time: '12:06', trans: 'Điều đó phù hợp với đội của chúng tôi.', orig: 'Gốc: That works for our team.' },
  { speaker: 'Bạn', lang: 'VI', time: '12:07', trans: 'Tuyệt, vậy chúng ta chốt như thế.', orig: 'Gốc: Great, let’s settle on that.', me: true },
];

export function Demo7History({ navigation }: RttStackScreenProps<'History'>) {
  return (
    <View className="flex-1 bg-tp-bg">
      {/* Top bar */}
      <View className="flex-row items-center justify-between border-b border-tp-border px-8 py-[18px]">
        <Pressable onPress={() => navigation.goBack()} className="flex-row items-center gap-2.5">
          <ArrowLeft size={18} color={TP.text2} />
          <Text className="text-lg font-semibold text-tp-text">Lịch sử dịch</Text>
        </Pressable>
        <Text className="text-sm text-tp-text2">Phiên họp 00:12:45</Text>
        <View className="flex-row items-center gap-2 rounded-full border border-tp-border bg-tp-surface px-[18px] py-[9px]">
          <Download size={15} color={TP.text2} />
          <Text className="text-sm text-tp-text">Xuất bản ghi</Text>
        </View>
      </View>

      {/* Info */}
      <View className="px-8 py-3">
        <Text className="text-[13px] text-tp-muted">24 câu đã dịch, Bạn (VI) và David (EN)</Text>
      </View>

      {/* Transcript */}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 32, paddingVertical: 8, gap: 14 }}>
        {TURNS.map((t, i) => (
          <View key={i} className={`flex-row ${t.me ? 'justify-end' : 'justify-start'}`}>
            <View
              className={`w-[640px] max-w-full gap-1.5 rounded-2xl bg-tp-surface p-4 ${
                t.me ? 'border border-tp-accent' : 'border border-tp-border'
              }`}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm font-semibold text-tp-text">{t.speaker}</Text>
                  <View className="rounded-full border border-tp-border bg-tp-bg px-2 py-0.5">
                    <Text className="text-[11px] text-tp-text2">{t.lang}</Text>
                  </View>
                  <Text className="text-xs text-tp-muted">{t.time}</Text>
                </View>
                <Volume2 size={15} color={TP.text2} />
              </View>
              <Text className="text-[17px] leading-[23px] text-tp-text">{t.trans}</Text>
              <Text className="text-[13px] leading-[18px] text-tp-muted">{t.orig}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
