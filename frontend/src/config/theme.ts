/**
 * Cấu hình Dark / Light theme.
 *
 * Chiến lược: Tailwind `darkMode: 'class'` — bật/tắt dark mode bằng cách
 * thêm/bớt class `dark` trên thẻ <html>. File này quản lý việc đọc/ghi
 * lựa chọn của user vào localStorage và áp dụng lên DOM.
 */

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'app-theme';

/** Đọc theme đã lưu, fallback theo cấu hình hệ điều hành. */
export function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

/** Áp dụng theme lên DOM và lưu lại lựa chọn. */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  localStorage.setItem(THEME_STORAGE_KEY, mode);
}

/** Khởi tạo theme lúc app boot (gọi 1 lần trong main.tsx). */
export function initTheme(): ThemeMode {
  const mode = getStoredTheme();
  applyTheme(mode);
  return mode;
}
