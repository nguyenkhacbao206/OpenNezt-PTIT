/**
 * Authentication API. Every function returns the already-unwrapped `data`
 * payload and lets the normalised `ApiError` bubble up to the caller/store.
 */

import { api } from '@/config/axios';
import type { ApiResponse, AuthTokens } from '@/types/common';
import type { LoginPayload, RegisterPayload, User } from '@/types/user';

interface AuthResult {
  user: User;
  tokens: AuthTokens;
}

export const authService = {
  async login(payload: LoginPayload): Promise<AuthResult> {
    const { data } = await api.post<ApiResponse<AuthResult>>('/auth/login', payload);
    return data.data;
  },

  async register(payload: RegisterPayload): Promise<AuthResult> {
    const { data } = await api.post<ApiResponse<AuthResult>>('/auth/register', payload);
    return data.data;
  },

  async me(): Promise<User> {
    const { data } = await api.get<ApiResponse<User>>('/auth/me');
    return data.data;
  },

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const { data } = await api.post<ApiResponse<AuthTokens>>('/auth/refresh', {
      refreshToken,
    });
    return data.data;
  },

  async logout(): Promise<void> {
    await api.post<ApiResponse<null>>('/auth/logout');
  },
};
