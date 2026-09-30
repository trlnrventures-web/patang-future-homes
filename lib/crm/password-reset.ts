import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * 256 bits of entropy. The emailed token is the only thing standing between a
 * leaked database and an account takeover, so it is never short, never derived
 * from user data, and never reused.
 */
export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time comparison of a presented token against the stored hash.
 * A plain === would leak the digest a byte at a time through response timing,
 * which is exactly the secret the digest protects.
 */
export function tokenMatches(candidateHash: string, storedHash: string): boolean {
  const a = Buffer.from(candidateHash, "utf8");
  const b = Buffer.from(storedHash, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
