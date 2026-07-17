/**
 * Kiểu dữ liệu liên quan tới User (tài khoản người dùng).
 */

/** Vai trò người dùng trong hệ thống. */
export type UserRole = 'admin' | 'manager' | 'user' | 'guest';

/** Thông tin người dùng đầy đủ. */
export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/** Payload cập nhật hồ sơ cá nhân (các field đều tuỳ chọn). */
export interface UpdateUserProfilePayload {
  fullName?: string;
  avatarUrl?: string | null;
}

/** Tham số truy vấn danh sách người dùng. */
export interface UserListItem {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}
