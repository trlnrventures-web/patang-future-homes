// Email and phone are interchangeable login identifiers, so both go through the
// same normalization everywhere. Anything that stores or compares a phone must
// use normalizePhone, and anything that stores or compares an email must use
// normalizeEmail - otherwise a user who types "+91 98237 27172" fails to match
// the "9823727172" already on file.

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function looksLikeEmail(value: string): boolean {
  return value.includes("@");
}

/**
 * Reduces a phone number to its significant digits. Anything longer than 10
 * digits keeps only the last 10, which collapses the +91 / 0-prefixed /
 * bare forms of the same Indian mobile onto one value. Returns null for
 * anything with no digits at all, so a blank field is never mistaken for a
 * phone number.
 */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function isValidPhone(value: string): boolean {
  const digits = normalizePhone(value);
  return digits !== null && /^[6-9]\d{9}$/.test(digits);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}
