/**
 * Placeholder tạm cho các bước RTT chưa cắt UI. Sẽ thay dần bằng màn hình thật.
 */
import { Pressable, Text, View } from 'react-native';

export function makePlaceholder(title: string, next?: string) {
  return function PlaceholderScreen({ navigation }: any) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-tp-bg p-10">
        <Text className="text-2xl font-semibold text-tp-text">{title}</Text>
        <Text className="text-[15px] text-tp-text2">Màn hình này sẽ được cắt tiếp theo thiết kế.</Text>
        {next && (
          <Pressable
            onPress={() => navigation.navigate(next)}
            className="mt-2 items-center justify-center rounded-full bg-tp-accent px-6 py-3"
          >
            <Text className="text-base font-semibold text-tp-bg">Tiếp tục →</Text>
          </Pressable>
        )}
      </View>
    );
  };
}
