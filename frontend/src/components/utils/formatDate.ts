/**
 * Tiện ích định dạng ngày giờ.
 */

const DEFAULT_LOCALE = 'vi-VN';

/** Định dạng ngày: 17/07/2026 */
export function formatDate(
  value: string | number | Date,
  locale: string = DEFAULT_LOCALE,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/** Định dạng ngày giờ: 17/07/2026 14:30 */
export function formatDateTime(
  value: string | number | Date,
  locale: string = DEFAULT_LOCALE,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
