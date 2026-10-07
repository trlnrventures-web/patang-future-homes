import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq } from "drizzle-orm";
import { getAuthUser, signToken, setAuthCookie } from "@/lib/crm/auth";
import { writeAuditLog } from "@/lib/crm/audit";
import {
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
} from "@/lib/crm/identifiers";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const dbUser = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .get();

  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      phone: dbUser.phone,
      mustChangePassword: !!dbUser.mustChangePassword,
      lastLoginAt: dbUser.lastLoginAt,
    },
  });
}

/**
 * Self-service profile edit: any signed-in user may change their own name,
 * email and phone. Role, salary, week-off and activation stay admin-only on
 * the Team screen, so anything else in the body is ignored rather than
 * honoured - a caller posting `role: "admin"` must not receive it.
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const db = getDb();
    const target = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, auth.id))
      .get();
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = String(body.name ?? "").trim();
      if (!name) {
        return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      }
      if (name.length > 100) {
        return NextResponse.json({ error: "Name is too long" }, { status: 400 });
      }
      if (name !== target.name) updates.name = name;
    }

    // Email and phone are login identifiers, so both are held to the same
    // uniqueness rule the login lookup assumes - the rules and messages match
    // the admin Team screen so one edit path never accepts what the other
    // rejects.
    if (body.email !== undefined) {
      const email = normalizeEmail(String(body.email ?? ""));
      if (!isValidEmail(email)) {
        return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
      }
      const taken = db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .get();
      if (taken && taken.id !== target.id) {
        return NextResponse.json(
          { error: "That email is already used by another account" },
          { status: 400 }
        );
      }
      if (email !== target.email) {
        updates.email = email;
        // A reset link in flight was delivered to the address they just
        // gave up, so it stops working here instead of outliving the change.
        updates.passwordResetTokenHash = null;
        updates.passwordResetExpiresAt = null;
      }
    }

    if (body.phone !== undefined) {
      const raw = String(body.phone ?? "").trim();
      if (raw === "") {
        if (target.phone !== null) updates.phone = null;
      } else {
        const phone = normalizePhone(raw);
        if (!phone || !isValidPhone(phone)) {
          return NextResponse.json(
            { error: "Enter a valid 10-digit mobile number" },
            { status: 400 }
          );
        }
        const taken = db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.phone, phone))
          .get();
        if (taken && taken.id !== target.id) {
          return NextResponse.json(
            { error: "That phone number is already used by another account" },
            { status: 400 }
          );
        }
        if (phone !== target.phone) updates.phone = phone;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No changes to save" }, { status: 400 });
    }

    db.update(schema.users)
      .set(updates)
      .where(eq(schema.users.id, target.id))
      .run();

    const name = (updates.name as string) ?? target.name;
    const email = (updates.email as string) ?? target.email;
    const changes = Object.keys(updates)
      .map((k) => `${k}: ${updates[k]}`)
      .join(", ");

    writeAuditLog({
      category: "attendance",
      action: "own_profile_updated",
      actorUserId: target.id,
      targetUserId: target.id,
      entityType: "user",
      entityId: target.id,
      summary: `Updated their own profile: ${changes}.`,
      details: updates,
    });

    // The JWT carries name and email, so it has to be re-issued or the header
    // keeps showing the old name until the 7-day token expires.
    const token = await signToken({
      id: target.id,
      name,
      email,
      role: target.role,
      mustChangePassword: !!target.mustChangePassword,
    });

    return NextResponse.json(
      {
        user: {
          id: target.id,
          name,
          email,
          role: target.role,
          phone:
            updates.phone !== undefined ? (updates.phone as string | null) : target.phone,
          mustChangePassword: !!target.mustChangePassword,
        },
      },
      { headers: setAuthCookie(token) }
    );
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}