import { NextRequest } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq } from "drizzle-orm";
import { hashResetToken, tokenMatches } from "@/lib/crm/password-reset";
import { clearFailures } from "@/lib/crm/rate-limit";
import bcrypt from "bcryptjs";

const MIN_PASSWORD_LENGTH = 8;

// One message for every rejection. A caller who cannot tell "expired" from
// "already used" from "not a token" cannot probe which tokens were ever real.
const INVALID_LINK = { error: "This reset link is invalid or has expired. Request a new one." };

export async function POST(request: NextRequest) {
  try {
    const { token, newPassword } = await request.json();

    if (typeof token !== "string" || !token) {
      return Response.json(INVALID_LINK, { status: 400 });
    }
    if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
      return Response.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }

    const now = Date.now();
    const db = getDb();

    const tokenHash = hashResetToken(token);
    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.passwordResetTokenHash, tokenHash))
      .get();

    if (!user || !user.passwordResetTokenHash) {
      return Response.json(INVALID_LINK, { status: 400 });
    }

    if (!tokenMatches(tokenHash, user.passwordResetTokenHash)) {
      return Response.json(INVALID_LINK, { status: 400 });
    }

    if (user.passwordResetUsedAt) {
      return Response.json(INVALID_LINK, { status: 400 });
    }

    const expiresAt = user.passwordResetExpiresAt
      ? new Date(user.passwordResetExpiresAt).getTime()
      : 0;
    if (!expiresAt || expiresAt <= now) {
      return Response.json(INVALID_LINK, { status: 400 });
    }

    if (!user.active) {
      return Response.json(INVALID_LINK, { status: 400 });
    }

    // Burn the link and set the new password in one write. Clearing the hash is
    // what makes it single-use: a second submission finds no row at all, so
    // there is no window where two concurrent requests both pass the check.
    db.update(schema.users)
      .set({
        passwordHash: bcrypt.hashSync(newPassword, 10),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        passwordResetUsedAt: new Date(now).toISOString(),
        mustChangePassword: false,
        resetRequestedAt: null,
      })
      .where(eq(schema.users.id, user.id))
      .run();

    // The old password is dead, so any lockout counted against the previous
    // one is meaningless and would only lock the person out of their new
    // password. The reset-request throttle is spent too - they have proved
    // control of the mailbox.
    clearFailures(db, `reset:${user.email}`);
    clearFailures(db, user.email);

    return Response.json({
      ok: true,
      message: "Your password has been changed. You can sign in now.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
