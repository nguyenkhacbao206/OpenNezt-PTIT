/**
 * HomePage — trang chủ (public).
 */
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { env } from '@/config/env';

export function HomePage() {
  return (
    <section className="mx-auto max-w-3xl text-center">
      <h1 className="mb-4 text-4xl font-bold text-gray-900 dark:text-gray-100">
        Chào mừng đến với {env.appName}
      </h1>
      <p className="mb-8 text-gray-600 dark:text-gray-400">
        Bộ khung Web sạch với ReactJS + TypeScript + Vite + Tailwind CSS,
        cấu hình Axios chuyên nghiệp và sẵn sàng mở rộng.
      </p>
      <div className="flex justify-center gap-3">
        <Link to="/dashboard">
          <Button variant="primary">Vào Dashboard</Button>
        </Link>
        <Link to="/about">
          <Button variant="ghost">Tìm hiểu thêm</Button>
        </Link>
      </div>
    </section>
  );
}

export default HomePage;
