/**
 * authService — các API liên quan tới xác thực.
 *
 * Tầng service CHỈ chịu trách nhiệm gọi API và trả về dữ liệu đã gõ kiểu.
 * KHÔNG chứa logic UI, KHÔNG đụng vào store. Việc lưu token / cập nhật
 * state do tầng store/hook đảm nhiệm.
 */
import { httpClient } from '@/config/axios';
import type {
  AuthResult,
  AuthTokens,
  LoginPayload,
  RegisterPayload,
} from '@/types';

export const authService = {
  /** Đăng nhập bằng email + mật khẩu. */
  async login(payload: LoginPayload): Promise<AuthResult> {
    const { data } = await httpClient.post<AuthResult>('/auth/login', payload);
    return data;
  },

  /** Đăng ký tài khoản mới. */
  async register(payload: RegisterPayload): Promise<AuthResult> {
    const { data } = await httpClient.post<AuthResult>('/auth/register', payload);
    return data;
  },

  /** Làm mới access token. */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const { data } = await httpClient.post<AuthTokens>('/auth/refresh', {
      refreshToken,
    });
    return data;
  },

  /** Đăng xuất (thu hồi phiên phía server). */
  async logout(): Promise<void> {
    await httpClient.post('/auth/logout');
  },
};
