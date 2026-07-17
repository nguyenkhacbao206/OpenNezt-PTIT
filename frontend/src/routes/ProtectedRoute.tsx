/**
 * ProtectedRoute — chặn truy cập khi chưa đăng nhập.
 * Điều hướng về /login và ghi nhớ trang đích để quay lại sau khi đăng nhập.
 */
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppStore } from '@/store';
import { ROUTE_PATHS } from './paths';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return (
      <Navigate
        to={ROUTE_PATHS.LOGIN}
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <>{children}</>;
}
