/**
 * Input — labelled text field with an optional error message.
 * Forwards all native TextInput props and keeps them fully typed.
 */

import { forwardRef } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors } from '@/config/theme';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, className, ...rest },
  ref,
) {
  return (
    <View className="w-full">
      {label ? (
        <Text className="mb-1.5 text-sm font-medium text-gray-700">{label}</Text>
      ) : null}

      <TextInput
        ref={ref}
        placeholderTextColor={colors.muted}
        className={[
          'w-full rounded-xl border bg-surface px-4 py-3 text-base text-gray-900',
          error ? 'border-danger' : 'border-gray-200',
          className ?? '',
        ].join(' ')}
        {...rest}
      />

      {error ? <Text className="mt-1 text-sm text-danger">{error}</Text> : null}
    </View>
  );
});
