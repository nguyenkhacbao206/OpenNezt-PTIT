/**
 * SafeAreaWrapper — fills the screen and respects device safe-area insets.
 * Use as the outermost element of every screen.
 */

import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

export interface SafeAreaWrapperProps {
  children: ReactNode;
  /** Which edges to apply insets to. Default: top + bottom. */
  edges?: Edge[];
  className?: string;
}

export function SafeAreaWrapper({
  children,
  edges = ['top', 'bottom'],
  className,
}: SafeAreaWrapperProps) {
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-background">
      <View className={`flex-1 ${className ?? ''}`}>{children}</View>
    </SafeAreaView>
  );
}
