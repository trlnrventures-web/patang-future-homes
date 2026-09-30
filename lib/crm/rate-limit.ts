import { eq } from "drizzle-orm";
import * as schema from "./schema";
import type { getDb } from "./db";

// One table backs every throttle in the auth flow. The key is namespaced by
// caller so a login budget is never spent by a password-reset request, or the
// reverse.
type Db = ReturnType<typeof getDb>;

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

// Deliberately much lower than the login budget: every hit on this endpoint
// sends a real email, so it is bounded to stop one address being used to burn
// through the sending quota, and to stop enumeration from being free.
export const RESET_MAX_REQUESTS = 3;
export const RESET_WINDOW_MS = 15 * 60 * 1000;

function read(db: Db, key: string) {
  return db
    .select()
    .from(schema.loginAttempts)
    .where(eq(schema.loginAttempts.identifier, key))
    .get();
}

/**
 * Minutes left on a live lockout, or null when the key is free to proceed.
 * Callers must not vary their response on which account the key belongs to -
 * see the login route, where "locked" and "wrong password" are both surfaced
 * as the same generic failure.
 */
export function lockoutMinutesRemaining(
  db: Db,
  key: string,
  now: number = Date.now()
): number | null {
  const existing = read(db, key);
  if (!existing?.lockedUntil) return null;
  const until = new Date(existing.lockedUntil).getTime();
  if (until <= now) return null;
  return Math.ceil((until - now) / 60000);
}

export function recordFailure(
  db: Db,
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now()
) {
  const existing = read(db, key);
  const nextCount = (existing?.failedCount ?? 0) + 1;
  const locked = nextCount >= limit ? new Date(now + windowMs).toISOString() : null;
  // Counting restarts at zero once a lockout is armed. Otherwise a caller who
  // keeps guessing extends one 15-minute lockout indefinitely, which reads as
  // an account that can never be logged into.
  const resetCount = locked ? 0 : nextCount;
  const updatedAt = new Date(now).toISOString();

  if (existing) {
    db.update(schema.loginAttempts)
      .set({ failedCount: resetCount, lockedUntil: locked, updatedAt })
      .where(eq(schema.loginAttempts.identifier, key))
      .run();
  } else {
    db.insert(schema.loginAttempts)
      .values({ identifier: key, failedCount: resetCount, lockedUntil: locked, updatedAt })
      .run();
  }
}

export function clearFailures(db: Db, key: string, now: number = Date.now()) {
  const updatedAt = new Date(now).toISOString();
  db.insert(schema.loginAttempts)
    .values({ identifier: key, failedCount: 0, lockedUntil: null, updatedAt })
    .onConflictDoUpdate({
      target: schema.loginAttempts.identifier,
      set: { failedCount: 0, lockedUntil: null, updatedAt },
    })
    .run();
}
