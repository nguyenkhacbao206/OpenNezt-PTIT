/**
 * useRttT — từ điển văn bản RTT theo ngôn ngữ mẹ đẻ của người dùng.
 *
 * UI của RTT hiển thị bằng ngôn ngữ mẹ đẻ (`srcLang` trong store): 'vi' → tiếng
 * Việt, còn lại → tiếng Anh. Trả về đối tượng `RttDict` để màn hình gọi
 * `t.<namespace>.<key>`.
 */
import { useStore } from '@/store';
import { rttText, uiLangFromLang, type RttDict } from '@/i18n/rtt';

export function useRttT(): RttDict {
  const lang = useStore((s) => s.srcLang);
  return rttText[uiLangFromLang(lang)];
}
