/**
 * Shared, domain-agnostic types used across the whole application.
 * Keep API-contract shapes here so services and the store agree on them.
 */

/** Standard envelope every backend endpoint returns. */
export interface ApiResponse<TData = unknown> {
  success: boolean;
  message: string;
  data: TData;
}

/** Paginated collection payload. */
export interface Paginated<TItem> {
  items: TItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Normalised error shape produced by the axios interceptor. */
export interface ApiError {
  status: number;
  message: string;
  /** Field-level validation errors, keyed by field name. */
  errors?: Record<string, string[]>;
}

/** Async request lifecycle status — handy for store slices. */
export type RequestStatus = 'idle' | 'loading' | 'success' | 'error';

/** Auth token pair returned by login/refresh endpoints. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Utility: make a type nullable. */
export type Nullable<T> = T | null;
