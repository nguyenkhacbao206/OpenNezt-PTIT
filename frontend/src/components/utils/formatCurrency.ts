/**
 * Tiện ích định dạng tiền tệ.
 */

/** Định dạng số thành tiền VND: 1.500.000 ₫ */
export function formatCurrency(
  amount: number,
  currency: string = 'VND',
  locale: string = 'vi-VN',
): string {
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Định dạng số có phân tách hàng nghìn: 1.234.567 */
export function formatNumber(value: number, locale: string = 'vi-VN'): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale).format(value);
}
