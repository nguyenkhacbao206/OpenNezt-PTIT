/**
 * Auth slice — holds the authenticated user + status and exposes the async
 * actions (login / register / logout / bootstrap). Tokens are persisted to
 * AsyncStorage (the single source of truth the axios interceptor reads from);
 * this slice only mirrors the *session* status in memory.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateCreator } from 'zustand';

import { STORAGE_KEYS } from '@/config/axios';
import { authService } from '@/services/authService';
import type { RequestStatus, AuthTokens } from '@/types/common';
import type { LoginPayload, RegisterPayload, User } from '@/types/user';
import type { RootStore } from '../index';

export interface AuthSlice {
  user: User | null;
  status: RequestStatus;
  error: string | null;
  /** True once bootstrap has finished — gate the navigator on this. */
  hydrated: boolean;

  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  /** Restore the session on app launch from a persisted token. */
  bootstrap: () => Promise<void>;
}

async function persistTokens(tokens: AuthTokens): Promise<void> {
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken],
    [STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken],
  ]);
}

export const createAuthSlice: StateCreator<RootStore, [], [], AuthSlice> = (set) => ({
  user: null,
  status: 'idle',
  error: null,
  hydrated: false,

  login: async (payload) => {
    set({ status: 'loading', error: null });
    try {
      const { user, tokens } = await authService.login(payload);
      await persistTokens(tokens);
      set({ user, status: 'success' });
    } catch (err) {
      set({ status: 'error', error: toMessage(err) });
      throw err;
    }
  },

  register: async (payload) => {
    set({ status: 'loading', error: null });
    try {
      const { user, tokens } = await authService.register(payload);
      await persistTokens(tokens);
      set({ user, status: 'success' });
    } catch (err) {
      set({ status: 'error', error: toMessage(err) });
      throw err;
    }
  },

  logout: async () => {
    try {
      await authService.logout();
    } finally {
      // Always clear local session even if the network call fails.
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
      ]);
      set({ user: null, status: 'idle', error: null });
    }
  },

  bootstrap: async () => {
    try {
      const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      if (!token) {
        set({ hydrated: true });
        return;
      }
      const user = await authService.me();
      set({ user, hydrated: true });
    } catch {
      // Token invalid/expired — start unauthenticated.
      set({ user: null, hydrated: true });
    }
  },
});

function toMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return 'Something went wrong. Please try again.';
}
