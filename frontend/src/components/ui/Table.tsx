/**
 * Table — bảng dữ liệu tuỳ biến (generic), gõ kiểu theo từng dòng.
 *
 * Ví dụ:
 *   <Table<User>
 *     data={users}
 *     rowKey={(u) => u.id}
 *     columns={[
 *       { key: 'name', header: 'Tên', render: (u) => u.fullName },
 *       { key: 'email', header: 'Email', render: (u) => u.email },
 *     ]}
 *   />
 */
import type { ReactNode } from 'react';
import { cn } from '@/components/utils';

export interface TableColumn<TRow> {
  key: string;
  header: ReactNode;
  render: (row: TRow, index: number) => ReactNode;
  className?: string;
}

interface TableProps<TRow> {
  data: TRow[];
  columns: TableColumn<TRow>[];
  rowKey: (row: TRow, index: number) => string | number;
  isLoading?: boolean;
  emptyText?: string;
}

export function Table<TRow>({
  data,
  columns,
  rowKey,
  isLoading = false,
  emptyText = 'Không có dữ liệu',
}: TableProps<TRow>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400',
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
          {isLoading ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-sm text-gray-500"
              >
                Đang tải...
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-sm text-gray-500"
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                className="hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-sm text-gray-700 dark:text-gray-300',
                      col.className,
                    )}
                  >
                    {col.render(row, index)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
