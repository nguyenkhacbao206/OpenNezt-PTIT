/**
 * Container — consistent horizontal padding wrapper for screen content.
 * Optionally scrollable for long content.
 */

import type { ReactNode } from 'react';
import { ScrollView, View, type ScrollViewProps } from 'react-native';

export interface ContainerProps {
  children: ReactNode;
  scroll?: boolean;
  className?: string;
  contentContainerClassName?: string;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
}

export function Container({
  children,
  scroll = false,
  className,
  contentContainerClassName,
  keyboardShouldPersistTaps = 'handled',
}: ContainerProps) {
  if (scroll) {
    return (
      <ScrollView
        className={`flex-1 ${className ?? ''}`}
        contentContainerClassName={`px-4 py-4 ${contentContainerClassName ?? ''}`}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }

  return <View className={`flex-1 px-4 py-4 ${className ?? ''}`}>{children}</View>;
}
