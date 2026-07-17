/**
 * Central Axios instance with request/response interceptors.
 *
 *  - Request:  automatically attaches the access token pulled from AsyncStorage.
 *  - Response: unwraps the network error into a normalised `ApiError` and, on a
 *              401, clears the stored token so the UI can redirect to login.
 *
 * Import this `api` instance from services — never create ad-hoc axios clients.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

import type { ApiError } from '@/types/common';
import { env } from './env';

/** AsyncStorage keys — exported so the auth store reuses the same constants. */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: '@auth/access_token',
  REFRESH_TOKEN: '@auth/refresh_token',
} as const;

export const api: AxiosInstance = axios.create({
  baseURL: env.API_URL,
  timeout: env.API_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

// --- Request interceptor: attach bearer token ------------------------------
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (token) {
      // Ensure headers is a mutable AxiosHeaders instance before setting.
      const headers = AxiosHeaders.from(config.headers);
      headers.set('Authorization', `Bearer ${token}`);
      config.headers = headers;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// --- Response interceptor: normalise errors --------------------------------
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string; errors?: Record<string, string[]> }>) => {
    // On unauthorized, drop the stale token so guards can force re-login.
    if (error.response?.status === 401) {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
      ]);
    }

    const normalised: ApiError = {
      status: error.response?.status ?? 0,
      message:
        error.response?.data?.message ??
        error.message ??
        'A network error occurred. Please try again.',
      errors: error.response?.data?.errors,
    };

    return Promise.reject(normalised);
  },
);

/** Type guard so callers can safely narrow a caught value to `ApiError`. */
export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'message' in value
  );
}
