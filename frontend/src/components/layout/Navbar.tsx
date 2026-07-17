/**
 * Navbar — thanh điều hướng trên cùng.
 */
import { Button } from '@/components/ui';
import { useAuth, useTheme } from '@/components/hooks';
import { env } from '@/config/env';

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6 dark:border-gray-700 dark:bg-gray-900">
      <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {env.appName}
      </span>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={toggleTheme}>
          {isDark ? '☀️ Sáng' : '🌙 Tối'}
        </Button>

        {isAuthenticated && (
          <>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {user?.fullName ?? user?.email}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void logout()}>
              Đăng xuất
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
