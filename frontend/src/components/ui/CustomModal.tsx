/**
 * CustomModal — a centered dialog built on the native Modal with a dimmed
 * backdrop. Tapping the backdrop requests a close.
 */

import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View, type ModalProps } from 'react-native';

export interface CustomModalProps extends Pick<ModalProps, 'animationType'> {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** When false, tapping the backdrop does not dismiss. Default: true. */
  dismissOnBackdrop?: boolean;
}

export function CustomModal({
  visible,
  onClose,
  title,
  children,
  animationType = 'fade',
  dismissOnBackdrop = true,
}: CustomModalProps) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType={animationType}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        className="flex-1 items-center justify-center bg-black/50 px-6"
        onPress={dismissOnBackdrop ? onClose : undefined}
      >
        {/* Stop propagation so taps inside the card don't close the modal. */}
        <Pressable
          className="w-full max-w-md rounded-2xl bg-surface p-5"
          onPress={(e) => e.stopPropagation()}
        >
          {title ? (
            <Text className="mb-3 text-lg font-semibold text-gray-900">{title}</Text>
          ) : null}
          <View>{children}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
