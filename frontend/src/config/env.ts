/**
 * Type-safe access to environment variables.
 *
 * Expo inlines any `process.env.EXPO_PUBLIC_*` reference at build time, so we
 * read them here once, validate, and export a strongly typed object. Nothing
 * else in the app should touch `process.env` directly.
 */

type AppEnvironment = 'development' | 'staging' | 'production';

interface Env {
  API_URL: string;
  API_TIMEOUT: number;
  APP_ENV: AppEnvironment;
  IS_DEV: boolean;
  /** WebSocket của backend phiên dịch real-time (STT/NMT/TTS). Có thể đổi trong app. */
  wsUrl: string;
}

function required(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(
      `[env] Missing required environment variable "${key}". ` +
        `Add it to your .env file (prefixed with EXPO_PUBLIC_).`,
    );
  }
  return value;
}

const appEnv = (process.env.EXPO_PUBLIC_APP_ENV ?? 'development') as AppEnvironment;

export const env: Env = {
  API_URL: required(process.env.EXPO_PUBLIC_API_URL, 'EXPO_PUBLIC_API_URL'),
  API_TIMEOUT: Number(process.env.EXPO_PUBLIC_API_TIMEOUT ?? 15000),
  APP_ENV: appEnv,
  IS_DEV: appEnv === 'development',
  wsUrl: process.env.EXPO_PUBLIC_WS_URL ?? 'ws://localhost:8000/ws',
};
