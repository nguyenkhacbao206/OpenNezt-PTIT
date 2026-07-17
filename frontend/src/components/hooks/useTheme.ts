/**
 * useTheme — quản lý dark/light mode, đồng bộ với config/theme.ts.
 */
import { useCallback, useState } from 'react';
import { applyTheme, getStoredTheme, type ThemeMode } from '@/config/theme';

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());

  const changeTheme = useCallback((mode: ThemeMode) => {
    applyTheme(mode);
    setTheme(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      return next;
    });
  }, []);

  return { theme, changeTheme, toggleTheme, isDark: theme === 'dark' };
}
