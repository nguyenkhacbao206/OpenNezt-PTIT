/**
 * useDebounce — trì hoãn cập nhật giá trị (hữu ích cho ô tìm kiếm).
 */
import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delayMs: number = 400): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
