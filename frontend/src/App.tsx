/**
 * App — application root. Composes the global providers and mounts the
 * navigator. Provider order matters:
 *
 *   SafeAreaProvider → (StatusBar) → AppNavigator (owns NavigationContainer)
 *
 * The NativeWind global stylesheet is imported once here so `className` works
 * everywhere in the tree.
 */

import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppNavigator } from '@/navigation/AppNavigator';
import { useStore } from '@/store';

import './global.css';

export default function App() {
  const hydrateSettings = useStore((s) => s.hydrateSettings);

  // Nạp cài đặt đã lưu (WS URL, ngôn ngữ, TTS) một lần khi mở app.
  useEffect(() => {
    void hydrateSettings();
  }, [hydrateSettings]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
