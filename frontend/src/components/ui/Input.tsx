/**
 * Input — ô nhập liệu nguyên tử kèm label và thông báo lỗi.
 */
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/components/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className, id, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <div className="flex w-full flex-col gap-1">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'w-full rounded-lg border px-3 py-2 text-sm outline-none transition',
          'bg-white text-gray-900 placeholder:text-gray-400',
          'dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700',
          'focus:ring-2 focus:ring-primary/40',
          error
            ? 'border-danger focus:ring-danger/40'
            : 'border-gray-300',
          className,
        )}
        aria-invalid={Boolean(error)}
        {...rest}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
});
