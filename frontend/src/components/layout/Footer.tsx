/**
 * Footer — chân trang.
 */
import { env } from '@/config/env';

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white px-6 py-4 text-center text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
      © {env.appName} — Base Web Frontend. All rights reserved.
    </footer>
  );
}
