/**
 * DashboardPage — TRANG MẪU HOÀN CHỈNH minh hoạ luồng chuẩn của dự án:
 *
 *   1. Gọi Service (thông qua Store slice `fetchUsers` -> userService.getUsers)
 *   2. Xử lý State bằng Store (Zustand) + hook tuỳ biến (useDebounce)
 *   3. Render UI bằng các component nguyên tử trong components/ui
 *
 * Đây là khuôn mẫu để mọi page khác trong dự án noi theo.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store';
import { useDebounce } from '@/components/hooks';
import { Input, Table, type TableColumn } from '@/components/ui';
import type { UserListItem } from '@/types';

export function DashboardPage() {
  // (2) State cục bộ cho ô tìm kiếm + debounce
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebounce(keyword, 400);

  // (2) Lấy state & action từ store bằng selector (tránh re-render thừa)
  const users = useAppStore((s) => s.users);
  const status = useAppStore((s) => s.usersStatus);
  const total = useAppStore((s) => s.usersTotal);
  const error = useAppStore((s) => s.usersError);
  const fetchUsers = useAppStore((s) => s.fetchUsers);

  // (1) Gọi service qua store mỗi khi từ khoá (đã debounce) thay đổi
  useEffect(() => {
    void fetchUsers({ search: debouncedKeyword, page: 1, pageSize: 20 });
  }, [debouncedKeyword, fetchUsers]);

  // (3) Định nghĩa cột cho bảng — gõ kiểu chặt theo UserListItem
  const columns = useMemo<TableColumn<UserListItem>[]>(
    () => [
      { key: 'fullName', header: 'Họ tên', render: (u) => u.fullName },
      { key: 'email', header: 'Email', render: (u) => u.email },
      {
        key: 'role',
        header: 'Vai trò',
        render: (u) => <span className="capitalize">{u.role}</span>,
      },
      {
        key: 'status',
        header: 'Trạng thái',
        render: (u) => (
          <span
            className={
              u.isActive
                ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700'
                : 'rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600'
            }
          >
            {u.isActive ? 'Hoạt động' : 'Khoá'}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Tổng quan người dùng
        </h1>
        <span className="text-sm text-gray-500">Tổng: {total}</span>
      </header>

      <div className="max-w-sm">
        <Input
          name="search"
          placeholder="Tìm theo tên hoặc email..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* (3) Render UI bằng component Table nguyên tử */}
      <Table<UserListItem>
        data={users}
        columns={columns}
        rowKey={(u) => u.id}
        isLoading={status === 'loading'}
        emptyText="Không tìm thấy người dùng nào"
      />
    </section>
  );
}

export default DashboardPage;
