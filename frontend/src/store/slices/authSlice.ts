/**
 * authSlice — quản lý trạng thái xác thực.
 *
 * Dùng Zustand theo "slice pattern": mỗi slice là một StateCreator được
 * gộp lại trong store/index.ts. Nhờ đó store lớn vẫn tách module rõ ràng.
 */
import type { StateCreator } from 'zustand';
import { authService } from '@/services';
import { tokenStorage } from '@/config/axios';
import type { LoginPayload, RequestStatus, User } from '@/types';
import type { AppStore } from '../index';

export interface AuthSlice {
  currentUser: User | null;
  isAuthenticated: boolean;
  authStatus: RequestStatus;
  authError: string | null;

  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  setCurrentUser: (user: User | null) => void;
}

/**
 * StateCreator nhận đầy đủ AppStore để có thể gọi chéo sang slice khác
 * nếu cần (ví dụ reset userSlice khi logout).
 */
export const createAuthSlice: StateCreator<AppStore, [], [], AuthSlice> = (
  set,
) => ({
  currentUser: null,
  isAuthenticated: Boolean(tokenStorage.getAccessToken()),
  authStatus: 'idle',
  authError: null,

  login: async (payload) => {
    set({ authStatus: 'loading', authError: null });
    try {
      const { user, tokens } = await authService.login(payload);
      tokenStorage.setTokens(tokens);
      set({
        currentUser: user,
        isAuthenticated: true,
        authStatus: 'success',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Đăng nhập thất bại';
      set({ authStatus: 'error', authError: message, isAuthenticated: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await authService.logout();
    } finally {
      tokenStorage.clear();
      set({
        currentUser: null,
        isAuthenticated: false,
        authStatus: 'idle',
        authError: null,
      });
    }
  },

  setCurrentUser: (user) =>
    set({ currentUser: user, isAuthenticated: user !== null }),
});
