/**
 * LoginPage — trang đăng nhập (public).
 * Minh hoạ: form -> validate (utils) -> gọi action login (store) -> điều hướng.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/components/hooks';
import { isValidEmail } from '@/components/utils';

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, status, error } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setEmailError('Email không hợp lệ');
      return;
    }
    setEmailError(null);
    try {
      await login({ email, password });
      const state = location.state as LocationState | null;
      navigate(state?.from ?? '/dashboard', { replace: true });
    } catch {
      // Lỗi đã được lưu trong store (authError) và hiển thị bên dưới.
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-md dark:bg-gray-900"
      >
        <h1 className="text-center text-2xl font-bold text-gray-900 dark:text-gray-100">
          Đăng nhập
        </h1>

        <Input
          name="email"
          type="email"
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          {...(emailError ? { error: emailError } : {})}
        />
        <Input
          name="password"
          type="password"
          label="Mật khẩu"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          isLoading={status === 'loading'}
        >
          Đăng nhập
        </Button>
      </form>
    </div>
  );
}

export default LoginPage;
