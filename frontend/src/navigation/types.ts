/**
 * Navigation type definitions.
 *
 * These param lists give every screen fully-typed `navigation` and `route`
 * props. When you add a screen, add it here first — the compiler will then flag
 * every navigation call that needs updating.
 *
 * The global declaration merges RootParamList into React Navigation so that
 * `navigation.navigate('AnyScreen')` is type-checked app-wide.
 */

import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';

/** Screens available in the unauthenticated (Auth) stack. */
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

/** Tabs available in the authenticated (Main) flow. */
export type MainTabParamList = {
  Translator: undefined;
  Home: undefined;
  Profile: { userId?: string } | undefined;
};

/** Top-level navigator switching between the two flows. */
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
};

// --- Per-screen prop helpers ------------------------------------------------

export type AuthStackScreenProps<T extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, T>;

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

/**
 * Tab screens can also reach the root stack (e.g. to reset back to Auth), so we
 * compose the tab props with the root stack props.
 */
export type MainTabScreenProps<T extends keyof MainTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, T>,
    RootStackScreenProps<keyof RootStackParamList>
  >;

// --- Global type augmentation ----------------------------------------------
declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
