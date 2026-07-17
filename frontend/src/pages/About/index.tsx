/**
 * AboutPage — trang giới thiệu (public).
 */
export function AboutPage() {
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-3xl font-bold text-gray-900 dark:text-gray-100">
        Giới thiệu
      </h1>
      <p className="text-gray-600 dark:text-gray-400">
        Đây là dự án Base Web chuẩn hoá kiến trúc frontend: phân tầng rõ ràng
        (config → services → store → pages), gõ kiểu nghiêm ngặt và dễ mở rộng.
        Xem <code>frontend/claude.md</code> để nắm quy ước phát triển.
      </p>
    </section>
  );
}

export default AboutPage;
