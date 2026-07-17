/**
 * userService — các API liên quan tới người dùng.
 */
import { httpClient } from '@/config/axios';
import type {
  ListQueryParams,
  PaginatedResponse,
  UpdateUserProfilePayload,
  User,
  UserListItem,
} from '@/types';

export const userService = {
  /** Lấy thông tin người dùng đang đăng nhập. */
  async getCurrentUser(): Promise<User> {
    const { data } = await httpClient.get<User>('/users/me');
    return data;
  },

  /** Cập nhật hồ sơ cá nhân. */
  async updateProfile(payload: UpdateUserProfilePayload): Promise<User> {
    const { data } = await httpClient.patch<User>('/users/me', payload);
    return data;
  },

  /** Lấy danh sách người dùng (có phân trang). */
  async getUsers(
    params: ListQueryParams = {},
  ): Promise<PaginatedResponse<UserListItem>> {
    const { data } = await httpClient.get<PaginatedResponse<UserListItem>>(
      '/users',
      { params },
    );
    return data;
  },

  /** Lấy chi tiết 1 người dùng theo id. */
  async getUserById(id: string): Promise<User> {
    const { data } = await httpClient.get<User>(`/users/${id}`);
    return data;
  },
};
