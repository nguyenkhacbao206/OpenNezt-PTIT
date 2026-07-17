/**
 * Các kiểu dữ liệu dùng chung toàn hệ thống.
 * Đặt ở đây những type không thuộc riêng một domain nào (user, auth...).
 */

/** Cấu trúc phản hồi chuẩn từ backend. */
export interface ApiResponse<TData> {
  success: boolean;
  message: string;
  data: TData;
}

/** Metadata phân trang. */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Phản hồi có phân trang. */
export interface PaginatedResponse<TItem> {
  items: TItem[];
  meta: PaginationMeta;
}

/** Tham số truy vấn danh sách phổ biến. */
export interface ListQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** Chuẩn hoá lỗi trả về cho UI (được map từ Axios error). */
export interface NormalizedError {
  status: number | null;
  message: string;
  code?: string;
  details?: Record<string, string[]>;
}

/** Trạng thái tải dữ liệu bất đồng bộ. */
export type RequestStatus = 'idle' | 'loading' | 'success' | 'error';
