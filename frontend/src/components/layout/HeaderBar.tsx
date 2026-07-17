/**
 * HeaderBar — reusable custom header for screens that hide the native header.
 * Supports an optional back button and a right-side action slot.
 */

import type { ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

export interface HeaderBarProps {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}

export function HeaderBar({ title, onBack, right }: HeaderBarProps) {
  return (
    <View className="h-14 flex-row items-center justify-between border-b border-gray-100 bg-surface px-4">
      <View className="w-10">
        {onBack ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            onPress={onBack}
          >
            <Text className="text-2xl text-gray-900">‹</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Text className="flex-1 text-center text-lg font-semibold text-gray-900" numberOfLines={1}>
        {title}
      </Text>

      <View className="w-10 items-end">{right}</View>
    </View>
  );
}
