/**
 * Demo 7 — Lịch sử dịch (rtt_hackathon.pen · "Demo 7 Lịch sử dịch").
 *
 * Mỗi lượt nói là MỘT entry (đã gộp). Bấm vào một entry → popup hiện đầy đủ
 * bản gốc + bản dịch. Rỗng thì báo chưa có câu nào.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Download, Volume2, X } from 'lucide-react-native';

import { useResponsive, useRttT } from '@/components/hooks';
import type { RttStackScreenProps } from '@/navigation/rttTypes';
import type { TranslatorTurn } from '@/types/translator';
import { useStore } from '@/store';

const TP = { accent: '#5EEAD4', text2: '#9AA0A6', muted: '#585E66' };

export function Demo7History({ navigation }: RttStackScreenProps<'History'>) {
  const { compact } = useResponsive();
  const t = useRttT();
  const insets = useSafeAreaInsets();
  const turns = useStore((s) => s.turns);
  const srcLang = useStore((s) => s.srcLang);
  const dstLang = useStore((s) => s.dstLang);
  const peerName = useStore((s) => s.room?.peer.name) ?? t.common.defaultPeerName;
  const [selected, setSelected] = useState<TranslatorTurn | null>(null);

  return (
    <View className="flex-1 bg-tp-bg" style={{ paddingTop: insets.top }}>
      {/* Top bar */}
      <View
        className={`flex-row items-center justify-between border-b border-tp-border ${
          compact ? 'px-4 py-3' : 'px-8 py-[18px]'
        }`}
      >
        <Pressable onPress={() => navigation.goBack()} className="flex-row items-center gap-2.5">
          <ArrowLeft size={18} color={TP.text2} />
          <Text className="text-lg font-semibold text-tp-text">{t.common.historyTitle}</Text>
        </Pressable>
        {!compact && <Text className="text-sm text-tp-text2">{t.demo7.currentSession}</Text>}
        <View className="flex-row items-center gap-2 rounded-full border border-tp-border bg-tp-surface px-[18px] py-[9px]">
          <Download size={15} color={TP.text2} />
          <Text className="text-sm text-tp-text">{t.demo7.exportTranscript}</Text>
        </View>
      </View>

      {/* Info */}
      <View className="px-8 py-3">
        <Text className="text-[13px] text-tp-muted">
          {t.demo7.info(turns.length, srcLang.toUpperCase(), dstLang.toUpperCase())}
        </Text>
      </View>

      {/* Transcript */}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: compact ? 16 : 32,
          paddingTop: 8,
          paddingBottom: 8 + insets.bottom,
          gap: 14,
        }}
      >
        {turns.length === 0 && (
          <Text className="py-10 text-center text-base text-tp-muted">
            {t.demo7.empty}
          </Text>
        )}
        {turns.map((turn) => {
          // Lời mình: canh phải, viền accent, chỉ hiện lời đã nói (ngôn ngữ mình).
          // Lời đối tác: canh trái, hiện bản dịch (ngôn ngữ mình) + câu gốc (ngôn ngữ họ).
          const mine = turn.mine === true;
          const label = mine ? t.common.you : peerName;
          const langTag = mine ? srcLang.toUpperCase() : dstLang.toUpperCase();
          return (
            <View key={turn.id} className={`flex-row ${mine ? 'justify-end' : 'justify-start'}`}>
              <Pressable
                onPress={() => setSelected(turn)}
                className={`w-[640px] max-w-full gap-1.5 rounded-2xl border bg-tp-surface p-4 ${
                  mine ? 'border-tp-accent' : 'border-tp-border'
                }`}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-semibold text-tp-text">{label}</Text>
                    <View className="rounded-full border border-tp-border bg-tp-bg px-2 py-0.5">
                      <Text className="text-[11px] text-tp-text2">{langTag}</Text>
                    </View>
                  </View>
                  <Volume2 size={15} color={TP.text2} />
                </View>
                <Text className="text-[17px] leading-[23px] text-tp-text" numberOfLines={3}>
                  {mine ? turn.srcText : turn.dstText}
                </Text>
                {mine
                  ? !!turn.dstText && (
                      <Text className="text-[13px] leading-[18px] text-tp-muted" numberOfLines={2}>
                        {t.common.translation}: {turn.dstText}
                      </Text>
                    )
                  : !!turn.srcText &&
                    turn.srcText !== turn.dstText && (
                      <Text className="text-[13px] leading-[18px] text-tp-muted" numberOfLines={2}>
                        {t.common.original}: {turn.srcText}
                      </Text>
                    )}
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {/* Popup chi tiết */}
      <Modal
        transparent
        visible={selected !== null}
        animationType="fade"
        onRequestClose={() => setSelected(null)}
        statusBarTranslucent
      >
        <Pressable
          className="flex-1 items-center justify-center px-6"
          style={{ backgroundColor: '#000000cc' }}
          onPress={() => setSelected(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full max-w-[680px] gap-5 rounded-2xl border border-tp-border bg-tp-surface p-6"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-tp-text">{t.demo7.detailTitle}</Text>
              <Pressable
                onPress={() => setSelected(null)}
                className="h-8 w-8 items-center justify-center rounded-full border border-tp-border"
              >
                <X size={16} color={TP.text2} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 18 }}>
              <View className="gap-2">
                <Text className="text-[11px] font-semibold tracking-[1.5px] text-tp-muted">
                  {t.demo7.translationOf(dstLang.toUpperCase())}
                </Text>
                <Text className="text-[19px] leading-[27px] font-medium" style={{ color: TP.accent }}>
                  {selected?.dstText}
                </Text>
              </View>
              <View className="h-px bg-tp-border" />
              <View className="gap-2">
                <Text className="text-[11px] font-semibold tracking-[1.5px] text-tp-muted">
                  {t.demo7.originalOf(srcLang.toUpperCase())}
                </Text>
                <Text className="text-[17px] leading-[25px] text-tp-text2">{selected?.srcText}</Text>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
