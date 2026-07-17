/// <reference types="vite/client" />

/**
 * Khai báo kiểu cho biến môi trường — giúp import.meta.env được gõ kiểu chặt.
 * Thêm biến mới ở đây mỗi khi thêm vào file .env.
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_APP_ENV: string;
  readonly VITE_API_TIMEOUT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
