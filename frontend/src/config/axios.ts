/**
 * Cấu hình Axios tập trung + Interceptors.
 *
 * Trách nhiệm:
 *  1. Tạo instance axios dùng chung (baseURL, timeout từ env).
 *  2. Request interceptor: tự động gắn `Authorization: Bearer <token>`
 *     lấy từ localStorage.
 *  3. Response interceptor: chuẩn hoá lỗi về `NormalizedError` và tự động
 *     refresh access token khi gặp 401 (chỉ thử 1 lần / request).
 *
 * LƯU Ý: Đây là NƠI DUY NHẤT đọc/ghi token. Các service khác gọi API
 * qua instance này chứ không tự dựng axios riêng.
 */
import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import { env } from './env';
import type { AuthTokens, NormalizedError } from '@/types';

/* ------------------------------------------------------------------ */
/* Token storage — tách riêng để dễ đổi sang cookie/secure storage sau */
/* ------------------------------------------------------------------ */
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export const tokenStorage = {
  getAccessToken: (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefreshToken: (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY),
  setTokens: (tokens: AuthTokens): void => {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  },
  clear: (): void => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

/* ------------------------------------------------------------------ */
/* Instance chính                                                      */
/* ------------------------------------------------------------------ */
export const httpClient: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: env.apiTimeout,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

/* ------------------------------------------------------------------ */
/* Request interceptor — gắn Bearer token                              */
/* ------------------------------------------------------------------ */
httpClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const token = tokenStorage.getAccessToken();
    if (token) {
      // Đảm bảo headers là AxiosHeaders để dùng .set an toàn
      const headers =
        config.headers instanceof AxiosHeaders
          ? config.headers
          : new AxiosHeaders(config.headers);
      headers.set('Authorization', `Bearer ${token}`);
      config.headers = headers;
    }
    return config;
  },
  (error: AxiosError): Promise<never> => Promise.reject(error),
);

/* ------------------------------------------------------------------ */
/* Response interceptor — refresh token + chuẩn hoá lỗi                */
/* ------------------------------------------------------------------ */

/** Cho phép đánh dấu request đã retry để tránh vòng lặp vô hạn. */
interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// Hàng chờ khi đang refresh — tránh gọi refresh nhiều lần song song.
let isRefreshing = false;
let pendingQueue: Array<(token: string | null) => void> = [];

function flushQueue(newToken: string | null): void {
  pendingQueue.forEach((resolve) => resolve(newToken));
  pendingQueue = [];
}

/** Gọi endpoint refresh bằng axios "trần" (không qua interceptor để tránh đệ quy). */
async function requestNewAccessToken(): Promise<string | null> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) return null;

  try {
    const { data } = await axios.post<AuthTokens>(
      `${env.apiBaseUrl}/auth/refresh`,
      { refreshToken },
      { headers: { 'Content-Type': 'application/json' } },
    );
    tokenStorage.setTokens(data);
    return data.accessToken;
  } catch {
    return null;
  }
}

/** Chuyển AxiosError thành lỗi thân thiện cho UI. */
function normalizeError(error: AxiosError): NormalizedError {
  const responseData = error.response?.data as
    | { message?: string; code?: string; errors?: Record<string, string[]> }
    | undefined;

  return {
    status: error.response?.status ?? null,
    message:
      responseData?.message ??
      error.message ??
      'Đã có lỗi xảy ra, vui lòng thử lại.',
    ...(responseData?.code !== undefined ? { code: responseData.code } : {}),
    ...(responseData?.errors !== undefined ? { details: responseData.errors } : {}),
  };
}

httpClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError): Promise<never> => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;
    const status = error.response?.status;

    // Xử lý 401: thử refresh token đúng 1 lần
    if (status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      // Nếu đang refresh rồi -> xếp hàng chờ token mới
      if (isRefreshing) {
        return new Promise<string | null>((resolve) => {
          pendingQueue.push(resolve);
        }).then((newToken) => {
          if (!newToken) return Promise.reject(normalizeError(error));
          originalRequest.headers.set('Authorization', `Bearer ${newToken}`);
          return httpClient(originalRequest);
        });
      }

      isRefreshing = true;
      const newToken = await requestNewAccessToken();
      isRefreshing = false;
      flushQueue(newToken);

      if (newToken) {
        originalRequest.headers.set('Authorization', `Bearer ${newToken}`);
        return httpClient(originalRequest);
      }

      // Refresh thất bại -> xoá token, buộc đăng nhập lại
      tokenStorage.clear();
      // Điều hướng về trang login (SPA): dùng full reload cho chắc chắn.
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }

    return Promise.reject(normalizeError(error));
  },
);

export default httpClient;
