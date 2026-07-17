/**
 * Centralize & validate biến môi trường.
 *
 * Mọi truy cập tới import.meta.env PHẢI đi qua file này — không rải rác
 * `import.meta.env.VITE_...` khắp codebase. Nếu thiếu biến bắt buộc,
 * app sẽ ném lỗi ngay lúc khởi động (fail-fast) thay vì lỗi mơ hồ khi chạy.
 */

type AppEnvironment = 'development' | 'staging' | 'production';

interface AppEnv {
  apiBaseUrl: string;
  appName: string;
  appEnv: AppEnvironment;
  apiTimeout: number;
}

/** Lấy biến bắt buộc — ném lỗi nếu rỗng/undefined. */
function requireEnv(key: string, value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `[env] Thiếu biến môi trường bắt buộc: ${key}. Vui lòng kiểm tra file .env`,
    );
  }
  return value;
}

/** Parse số nguyên với giá trị mặc định an toàn. */
function parseIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAppEnv(value: string | undefined): AppEnvironment {
  if (value === 'production' || value === 'staging' || value === 'development') {
    return value;
  }
  return 'development';
}

export const env: AppEnv = {
  apiBaseUrl: requireEnv('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL),
  appName: import.meta.env.VITE_APP_NAME ?? 'Base Web',
  appEnv: parseAppEnv(import.meta.env.VITE_APP_ENV),
  apiTimeout: parseIntEnv(import.meta.env.VITE_API_TIMEOUT, 15000),
};

export const isProduction = env.appEnv === 'production';
export const isDevelopment = env.appEnv === 'development';
