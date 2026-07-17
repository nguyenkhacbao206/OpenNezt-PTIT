/**
 * Bộ định tuyến chính — gom public + private routes.
 *
 * - Public & private routes cùng nằm trong MainLayout (Navbar/Sidebar/Footer).
 * - Private routes được bọc <ProtectedRoute> tại đây.
 * - Login & NotFound nằm ngoài layout chính.
 * - <Suspense> phục vụ lazy-loaded pages.
 */
import { createElement, lazy, Suspense } from 'react';
import { useRoutes, type RouteObject } from 'react-router-dom';
import { MainLayout } from '@/components/layout';
import { ProtectedRoute } from './ProtectedRoute';
import { publicRoutes } from './publicRoutes';
import { privateRoutes } from './privateRoutes';
import { ROUTE_PATHS } from './paths';

const LoginPage = lazy(() => import('@/pages/Login'));
const NotFoundPage = lazy(() => import('@/pages/NotFound'));

/** Bọc mỗi private route bằng ProtectedRoute. */
const guardedPrivateRoutes: RouteObject[] = privateRoutes.map((route) => {
  const { Component, ...rest } = route;
  return {
    ...rest,
    element: Component
      ? createElement(ProtectedRoute, null, createElement(Component))
      : undefined,
  };
});

const routeConfig: RouteObject[] = [
  {
    path: ROUTE_PATHS.HOME,
    Component: MainLayout,
    children: [...publicRoutes, ...guardedPrivateRoutes],
  },
  { path: ROUTE_PATHS.LOGIN, Component: LoginPage },
  { path: ROUTE_PATHS.NOT_FOUND, Component: NotFoundPage },
];

export function AppRoutes() {
  const element = useRoutes(routeConfig);
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-gray-500">
          Đang tải...
        </div>
      }
    >
      {element}
    </Suspense>
  );
}
