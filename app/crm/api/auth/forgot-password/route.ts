import { NextRequest } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, or } from "drizzle-orm";
import {
  looksLikeEmail,
  normalizeEmail,
  normalizePhone,
} from "@/lib/crm/identifiers";
import { buildPasswordResetUrl, sendPasswordResetEmail } from "@/lib/crm/mailer";
import { RESET_TTL_MS, generateResetToken } from "@/lib/crm/password-reset";
import {
  RESET_MAX_REQUESTS,
  RESET_WINDOW_MS,
  lockoutMinutesRemaining,
  recordFailure,
} from "@/lib/crm/rate-limit";

// The response body and status are identical whether or not the account
// exists, the account is deactivated, or the mail provider is down. Anything
// else turns this endpoint into a way to ask "does this person work here?".
const GENERIC_RESPONSE = {
  ok: true,
  message:
    "If that phone number or email belongs to an account, a reset link is on its way. Check your inbox.",
};

export async function POST(request: NextRequest) {
  try {
    const { identifier } = await request.json();

    if (!identifier || typeof identifier !== "string") {
      return Response.json(
        { error: "Enter your phone number or email" },
        { status: 400 }
      );
    }

    const email = looksLikeEmail(identifier) ? normalizeEmail(identifier) : null;
    const phone = email ? null : normalizePhone(identifier);
    if (!email && !phone) {
      return Response.json(
        { error: "Enter your phone number or email" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const db = getDb();

    // Phone is accepted here only as a way to find the account. The link always
    // goes to the address on file - there is no SMS channel, so a phone-only
    // lookup could not deliver anything.
    const user = db
      .select()
      .from(schema.users)
      .where(
        email
          ? eq(schema.users.email, email)
          : or(eq(schema.users.phone, phone!), eq(schema.users.email, identifier.trim().toLowerCase()))
      )
      .get();

    // Throttle on the submitted identifier whether or not it matched, so an
    // attacker cannot probe for valid accounts using a fresh address each time.
    const throttleKey = `reset:${email ?? phone}`;
    const locked = lockoutMinutesRemaining(db, throttleKey, now);
    if (locked !== null) {
      return Response.json(GENERIC_RESPONSE);
    }

    // Issuing a new link invalidates any previous one. Otherwise an email
    // forwarded around the office keeps working for its full 30 minutes even
    // after the owner has asked for a fresh link.
    if (user?.active) {
      const { token, tokenHash } = generateResetToken();
      db.update(schema.users)
        .set({
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: new Date(now + RESET_TTL_MS).toISOString(),
          passwordResetUsedAt: null,
        })
        .where(eq(schema.users.id, user.id))
        .run();

      try {
        const result = await sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          resetUrl: buildPasswordResetUrl(token),
        });
        if (!result.ok) {
          console.error(`[crm] password reset email failed for #${user.id}: ${result.error}`);
        }
      } catch (error) {
        // Never surfaced to the caller: distinguishing "mail bounced" from
        // "no such account" is exactly the leak this endpoint must not have.
        console.error(`[crm] password reset email threw for #${user.id}:`, error);
      }
    }

    recordFailure(db, throttleKey, RESET_MAX_REQUESTS, RESET_WINDOW_MS, now);
    return Response.json(GENERIC_RESPONSE);
  } catch (error) {
    console.error("Forgot password error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
