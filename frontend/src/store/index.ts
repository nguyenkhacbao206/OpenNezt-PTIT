/**
 * Store trung tâm — gộp tất cả slice thành một Zustand store duy nhất.
 *
 * Cách dùng trong component:
 *   const user = useAppStore((s) => s.currentUser);
 *   const login = useAppStore((s) => s.login);
 *
 * Luôn dùng selector (truyền hàm) để chỉ re-render khi phần state quan
 * tâm thay đổi — tránh lấy toàn bộ store.
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createAuthSlice, type AuthSlice } from './slices/authSlice';
import { createUserSlice, type UserSlice } from './slices/userSlice';
import {
  createTranslatorSlice,
  type TranslatorSlice,
} from './slices/translatorSlice';

/** Kiểu store tổng — hợp nhất mọi slice. */
export type AppStore = AuthSlice & UserSlice & TranslatorSlice;

export const useAppStore = create<AppStore>()(
  devtools(
    (...args) => ({
      ...createAuthSlice(...args),
      ...createUserSlice(...args),
      ...createTranslatorSlice(...args),
    }),
    { name: 'AppStore' },
  ),
);
