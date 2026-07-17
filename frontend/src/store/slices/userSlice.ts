/**
 * userSlice — quản lý danh sách người dùng (dữ liệu domain "user").
 */
import type { StateCreator } from 'zustand';
import { userService } from '@/services';
import type { ListQueryParams, RequestStatus, UserListItem } from '@/types';
import type { AppStore } from '../index';

export interface UserSlice {
  users: UserListItem[];
  usersStatus: RequestStatus;
  usersError: string | null;
  usersTotal: number;

  fetchUsers: (params?: ListQueryParams) => Promise<void>;
  resetUsers: () => void;
}

export const createUserSlice: StateCreator<AppStore, [], [], UserSlice> = (
  set,
) => ({
  users: [],
  usersStatus: 'idle',
  usersError: null,
  usersTotal: 0,

  fetchUsers: async (params) => {
    set({ usersStatus: 'loading', usersError: null });
    try {
      const { items, meta } = await userService.getUsers(params);
      set({
        users: items,
        usersTotal: meta.total,
        usersStatus: 'success',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Tải danh sách thất bại';
      set({ usersStatus: 'error', usersError: message });
    }
  },

  resetUsers: () =>
    set({ users: [], usersTotal: 0, usersStatus: 'idle', usersError: null }),
});
