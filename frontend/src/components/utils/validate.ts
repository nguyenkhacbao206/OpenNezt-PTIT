/**
 * Lightweight, dependency-free validators for forms.
 * Each returns an error string, or `null` when the value is valid.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  if (!value.trim()) return 'Email is required.';
  if (!EMAIL_RE.test(value)) return 'Enter a valid email address.';
  return null;
}

export function validatePassword(value: string, min = 6): string | null {
  if (!value) return 'Password is required.';
  if (value.length < min) return `Password must be at least ${min} characters.`;
  return null;
}

export function validateRequired(value: string, field = 'This field'): string | null {
  return value.trim() ? null : `${field} is required.`;
}

/** Returns true when every validator result is null. */
export function isFormValid(errors: Record<string, string | null>): boolean {
  return Object.values(errors).every((e) => e === null);
}
