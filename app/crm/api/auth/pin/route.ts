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
import { PIN_MAX_ATTEMPTS, isValidPinFormat, verifyPin } from "@/lib/crm/pin";
import bcrypt from "bcryptjs";

// Same decoy as the password route: a well-formed bcrypt hash nobody can match,
// compared against when the account is unknown so response time does not tell
// an attacker whether the identifier exists.
const DECOY_HASH = "$2b$10$FRiHIxya8TatuefzVcOQEO3CoDxVC6V7N/CL39Ht7GcmYX.8e9KNC";

const LOCKED_MESSAGE =
  "Account locked after too many wrong PIN attempts. Ask an admin to unlock it.";

/**
 * Phone/email + 4-digit PIN login.
 *
 * The account is named by the identifier and proved by the PIN. Five wrong
 * PINs hard-lock the account - not a timed lockout - and only an admin clears
 * it on the Team screen. A wrong PIN never says whether it was the PIN or the
 * identifier that was wrong, so accounts cannot be enumerated this way.
 */
export async function POST(request: NextRequest) {
  try {
    const { identifier, pin } = await request.json();

    if (!identifier || typeof identifier !== "string" || typeof pin !== "string") {
      return Response.json({ error: "Enter your phone/email and 4-digit PIN" }, { status: 400 });
    }
    if (!isValidPinFormat(pin)) {
      return Response.json({ error: "PIN must be 4 digits" }, { status: 400 });
    }

    const email = looksLikeEmail(identifier) ? normalizeEmail(identifier) : null;
    const phone = email ? null : normalizePhone(identifier);
    if (!email && !phone) {
      return Response.json({ error: "Enter your phone/email and 4-digit PIN" }, { status: 400 });
    }

    const db = getDb();
    const user = db
      .select()
      .from(schema.users)
      .where(
        email
          ? eq(schema.users.email, email)
          : or(
              eq(schema.users.phone, phone!),
              eq(schema.users.email, identifier.trim().toLowerCase())
            )
      )
      .get();

    // Unknown or deactivated account: spend the bcrypt cost so timing says
    // nothing, then answer with the same generic failure as a wrong PIN.
    if (!user || !user.active || !user.pinHash) {
      bcrypt.compareSync(pin, user?.pinHash || DECOY_HASH);
      return Response.json({ error: "Invalid phone/email or PIN" }, { status: 401 });
    }

    if (user.pinLocked) {
      return Response.json({ error: LOCKED_MESSAGE }, { status: 423 });
    }

    if (!verifyPin(pin, user.pinHash)) {
      const failed = user.pinFailedCount + 1;
      const locked = failed >= PIN_MAX_ATTEMPTS;
      db.update(schema.users)
        .set({ pinFailedCount: failed, pinLocked: locked })
        .where(eq(schema.users.id, user.id))
        .run();

      if (locked) {
        return Response.json({ error: LOCKED_MESSAGE }, { status: 423 });
      }
      const left = PIN_MAX_ATTEMPTS - failed;
      return Response.json(
        { error: `Wrong PIN. ${left} attempt${left === 1 ? "" : "s"} left.` },
        { status: 401 }
      );
    }

    // Correct PIN: clear the failure streak and the hard lock (a lock is never
    // set while the count is clean, but clearing both keeps the row coherent
    // if an admin resets a PIN without unlocking).
    const now = Date.now();
    db.update(schema.users)
      .set({
        pinFailedCount: 0,
        pinLocked: false,
        lastLoginAt: new Date(now).toISOString(),
      })
      .where(eq(schema.users.id, user.id))
      .run();

    // PIN is the factor, so the password bootstrap flag does not apply here.
    const token = await signToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: false,
    });

    return Response.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          mustChangePassword: false,
        },
      },
      { headers: setAuthCookie(token) }
    );
  } catch (error) {
    console.error("PIN login error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
