/**
 * publicRoutes — các route công khai, KHÔNG cần đăng nhập.
 *
 * Dùng `lazy` để code-split từng page. Route dùng thuộc tính `Component`
 * (React Router v6.4+) nên file này giữ được đuôi .ts (không cần JSX).
 */
import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { ROUTE_PATHS } from './paths';

const HomePage = lazy(() => import('@/pages/Home'));
const AboutPage = lazy(() => import('@/pages/About'));
const TranslatorPage = lazy(() => import('@/pages/Translator'));

export const publicRoutes: RouteObject[] = [
  { index: true, Component: HomePage },
  { path: ROUTE_PATHS.ABOUT, Component: AboutPage },
  { path: ROUTE_PATHS.TRANSLATOR, Component: TranslatorPage },
];
