/**
 * Card — surface container with padding, rounded corners and a soft shadow.
 * Optionally pressable when an `onPress` handler is provided.
 */

import type { ReactNode } from 'react';
import { TouchableOpacity, View, type ViewProps } from 'react-native';

export interface CardProps extends ViewProps {
  children: ReactNode;
  onPress?: () => void;
}

export function Card({ children, onPress, className, ...rest }: CardProps) {
  const classes = [
    'rounded-2xl bg-surface p-4 border border-gray-100',
    'shadow-sm shadow-black/5',
    className ?? '',
  ].join(' ');

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} className={classes}>
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View className={classes} {...rest}>
      {children}
    </View>
  );
}
