/**
 * useAuth — ergonomic access to the auth slice.
 *
 * Uses `useShallow` so the returned object is compared field-by-field; this
 * prevents the infinite re-render that a fresh object literal would otherwise
 * trigger with Zustand v5.
 */

import { useShallow } from 'zustand/react/shallow';

import { useStore } from '@/store';
import type { RequestStatus } from '@/types/common';
import type { LoginPayload, RegisterPayload, User } from '@/types/user';

interface UseAuthResult {
  user: User | null;
  isAuthenticated: boolean;
  status: RequestStatus;
  error: string | null;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  return useStore(
    useShallow((s) => ({
      user: s.user,
      isAuthenticated: s.user !== null,
      status: s.status,
      error: s.error,
      login: s.login,
      register: s.register,
      logout: s.logout,
    })),
  );
}
