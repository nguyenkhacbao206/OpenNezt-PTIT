/**
 * App — application root. Composes the global providers and mounts the
 * navigator. Provider order matters:
 *
 *   SafeAreaProvider → (StatusBar) → AppNavigator (owns NavigationContainer)
 *
 * The NativeWind global stylesheet is imported once here so `className` works
 * everywhere in the tree.
 */

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppNavigator } from '@/navigation/AppNavigator';

import './global.css';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
