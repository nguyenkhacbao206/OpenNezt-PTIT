/**
 * useResponsive — cờ bố cục theo bề rộng màn hình.
 *
 * Các màn RTT được cắt theo tỉ lệ desktop. Dùng hook này để co gọn font/padding
 * và gộp cột khi chạy trên điện thoại (màn hẹp), thay vì scale nhỏ toàn bộ.
 */
import { useWindowDimensions } from 'react-native';

/** Dưới ngưỡng này coi là điện thoại (bố cục dọc, gọn). */
const COMPACT_BREAKPOINT = 700;

export interface Responsive {
  width: number;
  height: number;
  /** true = điện thoại: co gọn font/padding, gộp cột. */
  compact: boolean;
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  return { width, height, compact: width < COMPACT_BREAKPOINT };
}
