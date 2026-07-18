/**
 * Button — atomic pressable with variants, sizes and a loading state.
 * Styled with NativeWind; all props are strictly typed (no `any`).
 */

import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  type TouchableOpacityProps,
} from 'react-native';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends TouchableOpacityProps {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const CONTAINER: Record<Variant, string> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  outline: 'bg-transparent border border-primary',
  ghost: 'bg-transparent',
  danger: 'bg-danger',
};

const LABEL: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-white',
  outline: 'text-primary',
  ghost: 'text-primary',
  danger: 'text-white',
};

const SIZE: Record<Size, string> = {
  sm: 'px-3 py-2',
  md: 'px-4 py-3',
  lg: 'px-6 py-4',
};

const LABEL_SIZE: Record<Size, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      activeOpacity={0.8}
      disabled={isDisabled}
      className={[
        'flex-row items-center justify-center rounded-xl',
        SIZE[size],
        CONTAINER[variant],
        fullWidth ? 'w-full' : '',
        isDisabled ? 'opacity-50' : '',
      ].join(' ')}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' || variant === 'ghost' ? '#2563eb' : '#fff'} />
      ) : (
        <Text className={`font-semibold ${LABEL[variant]} ${LABEL_SIZE[size]}`}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}
