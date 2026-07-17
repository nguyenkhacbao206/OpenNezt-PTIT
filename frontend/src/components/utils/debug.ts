/**
 * Debug logger cho luồng phiên dịch — CHỈ bật ở môi trường dev
 * (`import.meta.env.DEV`), tự tắt hoàn toàn khi build production.
 *
 * Tắt tạm trong dev: chạy ở Console `localStorage.translatorDebug = '0'` rồi F5.
 */
const ENABLED =
  import.meta.env.DEV &&
  (typeof localStorage === 'undefined' ||
    localStorage.getItem('translatorDebug') !== '0');

/** In một dòng log gắn nhãn `[xlate]` khi debug đang bật. */
export function dbg(tag: string, ...args: unknown[]): void {
  if (ENABLED) {
    console.log(`%c[xlate] ${tag}`, 'color:#16a34a;font-weight:bold', ...args);
  }
}
