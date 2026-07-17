/**
 * Main flow — bottom tab navigator shown once authenticated.
 */

import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { HomeScreen } from '@/screens/Home';
import { ProfileScreen } from '@/screens/Profile';
import { TranslatorScreen } from '@/screens/Translator';
import { colors } from '@/config/theme';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * Minimal emoji tab icon so the base runs with zero icon-library deps.
 * Swap for `@expo/vector-icons` in a real app.
 */
function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 22 : 18, opacity: focused ? 1 : 0.6 }}>{icon}</Text>;
}

export function MainTab() {
  return (
    <Tab.Navigator
      initialRouteName="Translator"
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tab.Screen
        name="Translator"
        component={TranslatorScreen}
        options={{
          title: 'Translator',
          tabBarIcon: ({ focused }) => <TabIcon icon="🎙️" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon icon="🏠" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon icon="👤" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}
