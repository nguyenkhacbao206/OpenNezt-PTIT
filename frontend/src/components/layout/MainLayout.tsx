/**
 * MainLayout — bố cục chính của hệ thống (Navbar + Sidebar + Footer).
 *
 * Dùng <Outlet /> của React Router để render page con bên trong khung.
 */
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';

export function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-950">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-x-hidden p-6">
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
}
