import { NextRequest } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, or } from "drizzle-orm";
import { signToken, setAuthCookie } from "@/lib/crm/auth";
import {
  looksLikeEmail,
  normalizeEmail,
  normalizePhone,
} from "@/lib/crm/identifiers";
import {
  LOGIN_LOCKOUT_MS,
  LOGIN_MAX_ATTEMPTS,
  clearFailures,
  lockoutMinutesRemaining,
  recordFailure,
} from "@/lib/crm/rate-limit";
import bcrypt from "bcryptjs";

// A real bcrypt hash of a value nobody knows. Comparing against it when the
// account does not exist makes the "no such user" path take the same ~100ms as
// a genuine check, so response time cannot be used to enumerate accounts. It
// must be a well-formed hash or bcryptjs would bail out immediately and undo
// the point of this.
const DECOY_HASH = "$2b$10$FRiHIxya8TatuefzVcOQEO3CoDxVC6V7N/CL39Ht7GcmYX.8e9KNC";

export async function POST(request: NextRequest) {
  try {
    const { identifier, password } = await request.json();

    if (
      !identifier ||
      typeof identifier !== "string" ||
      typeof password !== "string" ||
      !password
    ) {
      return Response.json(
        { error: "Enter your phone number or email, and your password" },
        { status: 400 }
      );
    }

    const email = looksLikeEmail(identifier) ? normalizeEmail(identifier) : null;
    const phone = email ? null : normalizePhone(identifier);

    if (!email && !phone) {
      return Response.json(
        { error: "Enter your phone number or email, and your password" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const db = getDb();

    const user = db
      .select()
      .from(schema.users)
      .where(
        email
          ? eq(schema.users.email, email)
          : or(eq(schema.users.phone, phone!), eq(schema.users.email, identifier.trim().toLowerCase()))
      )
      .get();

    // One lockout bucket per account, keyed on its canonical email. This is what
    // keeps phone and email attempts sharing a single 5-attempt budget - keying
    // on the raw string instead would hand every account twice the allowance,
    // one bucket per identifier. An identifier that matches nobody still gets
    // its own bucket, so a stranger guessing at addresses is throttled too.
    const lockoutKey = user ? normalizeEmail(user.email) : `unknown:${email ?? phone}`;

    // ---- Account lockout check (per-account rate limiting) ----
    const minutes = lockoutMinutesRemaining(db, lockoutKey, now);
    if (minutes !== null) {
      return Response.json(
        { error: `Too many failed attempts. Try again in ${minutes} min.` },
        { status: 429 }
      );
    }

    // Always spend the bcrypt cost, even when the account is unknown or
    // deactivated, so response time says nothing about whether it exists.
    const passwordMatches = bcrypt.compareSync(
      password,
      user?.active ? user.passwordHash : DECOY_HASH
    );
    const valid = !!user?.active && passwordMatches;

    if (!user || !valid) {
      recordFailure(db, lockoutKey, LOGIN_MAX_ATTEMPTS, LOGIN_LOCKOUT_MS, now);
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // ---- Success: clear attempts + latency tracking admin ----
    clearFailures(db, lockoutKey, now);

    db.update(schema.users)
      .set({ lastLoginAt: new Date(now).toISOString() })
      .where(eq(schema.users.id, user.id))
      .run();

    const token = await signToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: !!user.mustChangePassword,
    });

    return Response.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          mustChangePassword: !!user.mustChangePassword,
        },
      },
      { headers: setAuthCookie(token) }
    );
  } catch (error) {
    console.error("Login error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
