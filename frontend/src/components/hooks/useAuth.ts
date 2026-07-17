/**
 * useAuth — hook tiện lợi bọc quanh authSlice trong store.
 *
 * Giúp component chỉ cần `const { user, login, logout } = useAuth();`
 * mà không phải nhớ tên từng field trong store.
 */
import { useAppStore } from '@/store';

export function useAuth() {
  const user = useAppStore((s) => s.currentUser);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const status = useAppStore((s) => s.authStatus);
  const error = useAppStore((s) => s.authError);
  const login = useAppStore((s) => s.login);
  const logout = useAppStore((s) => s.logout);

  return { user, isAuthenticated, status, error, login, logout };
}
