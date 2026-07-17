/**
 * Global store — Zustand with the "slices" pattern.
 *
 * Each slice owns a cohesive part of the state (auth, settings, …) and is
 * merged into one `RootStore`. Consumers select the minimal state they need to
 * avoid unnecessary re-renders, e.g.:
 *
 *   const user = useStore((s) => s.user);
 *   const login = useStore((s) => s.login);
 */

import { create } from 'zustand';

import { createAuthSlice, type AuthSlice } from './slices/authSlice';
import { createSettingSlice, type SettingSlice } from './slices/settingSlice';

export type RootStore = AuthSlice & SettingSlice;

export const useStore = create<RootStore>()((...args) => ({
  ...createAuthSlice(...args),
  ...createSettingSlice(...args),
}));
