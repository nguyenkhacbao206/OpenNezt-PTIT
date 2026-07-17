/**
 * Sidebar — menu điều hướng bên trái.
 */
import { NavLink } from 'react-router-dom';
import { cn } from '@/components/utils';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Trang chủ', icon: '🏠' },
  { to: '/dashboard', label: 'Tổng quan', icon: '📊' },
  { to: '/about', label: 'Giới thiệu', icon: 'ℹ️' },
];

export function Sidebar() {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 md:block">
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary dark:text-primary-light'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
              )
            }
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
