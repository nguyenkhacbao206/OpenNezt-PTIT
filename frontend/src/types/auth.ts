/**
 * Kiểu dữ liệu liên quan tới xác thực (Authentication).
 */
import type { User } from './user';

/** Cặp token trả về sau khi đăng nhập. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Thời điểm hết hạn accessToken (epoch millis), phục vụ refresh chủ động. */
  expiresAt: number;
}

/** Payload gửi lên khi đăng nhập. */
export interface LoginPayload {
  email: string;
  password: string;
  remember?: boolean;
}

/** Payload gửi lên khi đăng ký. */
export interface RegisterPayload {
  email: string;
  password: string;
  fullName: string;
}

/** Kết quả trả về từ endpoint đăng nhập / đăng ký. */
export interface AuthResult {
  user: User;
  tokens: AuthTokens;
}

/** Payload để làm mới token. */
export interface RefreshTokenPayload {
  refreshToken: string;
}
