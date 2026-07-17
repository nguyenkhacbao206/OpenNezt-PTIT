/**
 * useWordReveal — lộ dần một chuỗi text theo TỪNG CHỮ (hiệu ứng word-by-word).
 *
 * Trả về phần đã lộ của `target`; mỗi `intervalMs` lộ thêm một từ cho tới khi
 * đủ. Đổi `resetKey` (vd id câu mới) -> lộ lại từ đầu. Khi `target` dài lên
 * trong cùng `resetKey`, chỉ animate phần thêm. `target` rỗng -> trả ''.
 *
 * Lưu ý: đây là hiệu ứng hiển thị phía client trên văn bản có sẵn, không phải
 * streaming per-word thật từ mô hình.
 */
import { useEffect, useRef, useState } from 'react';

function toWords(text: string): string[] {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

export function useWordReveal(
  target: string,
  resetKey?: string | number,
  intervalMs = 90,
): string {
  const words = toWords(target);
  const total = words.length;
  const [revealed, setRevealed] = useState(0);
  const totalRef = useRef(total);
  totalRef.current = total;

  // Câu mới (resetKey đổi) -> lộ lại từ đầu.
  useEffect(() => {
    setRevealed(0);
  }, [resetKey]);

  // Kẹp số từ đã lộ khi target ngắn lại (bị sửa).
  useEffect(() => {
    setRevealed((count) => (count > total ? total : count));
  }, [total]);

  // Nhịp lộ thêm một từ cho tới khi đủ.
  useEffect(() => {
    if (revealed >= totalRef.current) return;
    const id = window.setInterval(() => {
      setRevealed((count) => {
        if (count >= totalRef.current) {
          window.clearInterval(id);
          return count;
        }
        return count + 1;
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [revealed, intervalMs]);

  return words.slice(0, revealed).join(' ');
}
