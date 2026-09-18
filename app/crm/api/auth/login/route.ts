import { NextRequest } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq } from "drizzle-orm";
import { signToken, setAuthCookie } from "@/lib/crm/auth";
import bcrypt from "bcryptjs";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || typeof email !== "string" || typeof password !== "string") {
      return Response.json({ error: "Email and password required" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const now = Date.now();
    const db = getDb();

    // ---- Account lockout check (per-account rate limiting) ----
    const existingAttempt = db
      .select()
      .from(schema.loginAttempts)
      .where(eq(schema.loginAttempts.email, normalizedEmail))
      .get();

    if (existingAttempt?.lockedUntil && new Date(existingAttempt.lockedUntil).getTime() > now) {
      const minutes = Math.ceil(
        (new Date(existingAttempt.lockedUntil).getTime() - now) / 60000
      );
      return Response.json(
        { error: `Too many failed attempts. Try again in ${minutes} min.` },
        { status: 429 }
      );
    }

    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, normalizedEmail))
      .get();

    const valid = user?.active ? bcrypt.compareSync(password, user.passwordHash) : false;

    if (!user || !valid) {
      recordFailedAttempt(db, normalizedEmail, now);
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // ---- Success: clear attempts + latency tracking admin ----
    db.insert(schema.loginAttempts)
      .values({ email: normalizedEmail, failedCount: 0, lockedUntil: null, updatedAt: new Date(now).toISOString() })
      .onConflictDoUpdate({ target: schema.loginAttempts.email, set: { failedCount: 0, lockedUntil: null, updatedAt: new Date(now).toISOString() } })
      .run();

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

function recordFailedAttempt(
  db: ReturnType<typeof getDb>,
  email: string,
  now: number
) {
  const existing = db
    .select()
    .from(schema.loginAttempts)
    .where(eq(schema.loginAttempts.email, email))
    .get();

  const nextCount = (existing?.failedCount ?? 0) + 1;
  const locked =
    nextCount >= MAX_FAILED_ATTEMPTS ? new Date(now + LOCKOUT_MS).toISOString() : null;
  const resetCount = locked ? 0 : nextCount;
  const updatedAt = new Date(now).toISOString();

  if (existing) {
    db.update(schema.loginAttempts)
      .set({ failedCount: resetCount, lockedUntil: locked, updatedAt })
      .where(eq(schema.loginAttempts.email, email))
      .run();
  } else {
    db.insert(schema.loginAttempts)
      .values({ email, failedCount: resetCount, lockedUntil: locked, updatedAt })
      .run();
  }
}