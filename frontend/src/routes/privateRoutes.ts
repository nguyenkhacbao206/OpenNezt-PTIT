/**
 * privateRoutes — các route YÊU CẦU đăng nhập.
 *
 * Việc bọc bằng <ProtectedRoute> được thực hiện tập trung ở routes/index.tsx
 * để giữ file này thuần cấu hình (.ts, không JSX).
 */
import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { ROUTE_PATHS } from './paths';

const DashboardPage = lazy(() => import('@/pages/Dashboard'));

export const privateRoutes: RouteObject[] = [
  { path: ROUTE_PATHS.DASHBOARD, Component: DashboardPage },
];
