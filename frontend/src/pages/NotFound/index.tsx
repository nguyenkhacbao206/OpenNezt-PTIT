/**
 * NotFoundPage — trang 404.
 */
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';

export function NotFoundPage() {
  return (
    <section className="mx-auto max-w-lg py-20 text-center">
      <h1 className="mb-2 text-6xl font-bold text-primary">404</h1>
      <p className="mb-6 text-gray-600 dark:text-gray-400">
        Trang bạn tìm không tồn tại.
      </p>
      <Link to="/">
        <Button variant="primary">Về trang chủ</Button>
      </Link>
    </section>
  );
}

export default NotFoundPage;
