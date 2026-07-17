/**
 * cn — gộp các class có điều kiện (thay cho thư viện clsx nhỏ gọn).
 * Bỏ qua giá trị falsy, nối phần còn lại bằng khoảng trắng.
 *
 *   cn('btn', isActive && 'btn--active', undefined) => 'btn btn--active'
 */
export function cn(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter((v): v is string => Boolean(v)).join(' ');
}
