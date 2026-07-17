/**
 * Hằng số đường dẫn tập trung — tránh "magic string" rải rác khắp code.
 */
export const ROUTE_PATHS = {
  HOME: '/',
  ABOUT: '/about',
  TRANSLATOR: '/translator',
  DASHBOARD: '/dashboard',
  LOGIN: '/login',
  NOT_FOUND: '*',
} as const;

export type RoutePath = (typeof ROUTE_PATHS)[keyof typeof ROUTE_PATHS];
