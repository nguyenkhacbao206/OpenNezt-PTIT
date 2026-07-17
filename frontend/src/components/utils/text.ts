/**
 * Tiện ích văn bản thuần cho phần hiển thị phụ đề.
 */

/**
 * Chèn xuống dòng sau mỗi điểm ngắt câu (`. ! ? …`) để tách câu, giúp đoạn dài
 * dễ đọc hơn. Không thêm xuống dòng ở cuối chuỗi. Dùng kèm class
 * `whitespace-pre-line` khi render.
 */
export function withSentenceBreaks(text: string): string {
  return text.replace(/([.!?…])\s+(?=\S)/g, '$1\n').trim();
}
