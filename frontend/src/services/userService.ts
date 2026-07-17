/**
 * User API — profile fetching and updates.
 */

import { api } from '@/config/axios';
import type { ApiResponse, Paginated } from '@/types/common';
import type { UpdateProfilePayload, User } from '@/types/user';

export const userService = {
  async getProfile(userId: string): Promise<User> {
    const { data } = await api.get<ApiResponse<User>>(`/users/${userId}`);
    return data.data;
  },

  async updateProfile(userId: string, payload: UpdateProfilePayload): Promise<User> {
    const { data } = await api.patch<ApiResponse<User>>(`/users/${userId}`, payload);
    return data.data;
  },

  async list(page = 1, pageSize = 20): Promise<Paginated<User>> {
    const { data } = await api.get<ApiResponse<Paginated<User>>>('/users', {
      params: { page, pageSize },
    });
    return data.data;
  },
};
