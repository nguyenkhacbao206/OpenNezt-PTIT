/// <reference types="nativewind/types" />

/**
 * Local NativeWind className typings.
 *
 * NativeWind transforms `className` at build time (via the babel preset), so it
 * works at runtime on every component. These ambient augmentations tell
 * TypeScript about the props we actually use — kept local so typechecking does
 * not depend on how `react-native-css-interop` happens to be hoisted in
 * node_modules.
 */

import 'react-native';
import 'react-native-safe-area-context';

declare module 'react-native' {
  interface ViewProps {
    className?: string;
  }
  interface TextProps {
    className?: string;
  }
  interface ScrollViewProps {
    className?: string;
    contentContainerClassName?: string;
  }
  interface TextInputProps {
    className?: string;
    placeholderClassName?: string;
  }
  interface TouchableOpacityProps {
    className?: string;
  }
  interface PressableProps {
    className?: string;
  }
  interface KeyboardAvoidingViewProps {
    className?: string;
  }
  interface ImageProps {
    className?: string;
  }
}

declare module 'react-native-safe-area-context' {
  interface NativeSafeAreaViewProps {
    className?: string;
  }
}
