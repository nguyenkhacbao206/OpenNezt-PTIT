/**
 * User domain types.
 */

export type UserRole = 'admin' | 'user' | 'guest';

/** Authenticated account profile. */
export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

/** Login request payload. */
export interface LoginPayload {
  email: string;
  password: string;
}

/** Register request payload. */
export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
}

/** Editable subset of the profile. */
export type UpdateProfilePayload = Partial<Pick<User, 'fullName' | 'avatarUrl'>>;
