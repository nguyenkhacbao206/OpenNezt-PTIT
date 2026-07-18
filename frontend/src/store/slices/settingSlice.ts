/**
 * Setting slice — UI preferences (theme, language). Kept intentionally small;
 * add more app-wide preferences here.
 */

import type { StateCreator } from 'zustand';

import type { RootStore } from '../index';

export type ColorScheme = 'light' | 'dark' | 'system';
export type Language = 'en' | 'vi';

export interface SettingSlice {
  colorScheme: ColorScheme;
  language: Language;

  setColorScheme: (scheme: ColorScheme) => void;
  setLanguage: (language: Language) => void;
}

export const createSettingSlice: StateCreator<RootStore, [], [], SettingSlice> = (
  set,
) => ({
  colorScheme: 'system',
  language: 'vi',

  setColorScheme: (colorScheme) => set({ colorScheme }),
  setLanguage: (language) => set({ language }),
});
