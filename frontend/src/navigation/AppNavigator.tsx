/**
 * Root navigator — orchestrates the Auth ⇄ Main flows based on the auth state.
 *
 *  - Runs `bootstrap()` once on mount to restore a persisted session.
 *  - Shows a splash while `hydrated` is false to avoid an auth-screen flash.
 *  - Selects the stack purely from `isAuthenticated`; the two `Stack.Screen`
 *    entries are mutually exclusive so the whole tree swaps atomically.
 */

import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  DefaultTheme,
  NavigationContainer,
  type Theme as NavTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { colors } from '@/config/theme';
import { useStore } from '@/store';
import { AuthStack } from './AuthStack';
import { MainTab } from './MainTab';
import type { RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme: NavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

function SplashScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function AppNavigator() {
  const hydrated = useStore((s) => s.hydrated);
  const isAuthenticated = useStore((s) => s.user !== null);
  const bootstrap = useStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (!hydrated) {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <RootStack.Screen name="Main" component={MainTab} />
        ) : (
          <RootStack.Screen name="Auth" component={AuthStack} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
