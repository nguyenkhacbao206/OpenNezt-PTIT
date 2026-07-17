/**
 * Tiện ích kiểm tra/xác thực dữ liệu đầu vào.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Kiểm tra email hợp lệ. */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Kiểm tra độ mạnh mật khẩu: tối thiểu 8 ký tự, có chữ và số.
 * Trả về null nếu hợp lệ, hoặc thông báo lỗi nếu không.
 */
export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Mật khẩu tối thiểu 8 ký tự';
  if (!/[a-zA-Z]/.test(password)) return 'Mật khẩu phải có chữ cái';
  if (!/[0-9]/.test(password)) return 'Mật khẩu phải có chữ số';
  return null;
}

/** Kiểm tra chuỗi rỗng/toàn khoảng trắng. */
export function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}
