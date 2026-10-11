import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq } from "drizzle-orm";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { writeAuditLog } from "@/lib/crm/audit";
import { generatePin, hashPin } from "@/lib/crm/pin";

export const dynamic = "force-dynamic";

/**
 * Admin-only PIN management:
 *  - action "unlock": clears the 5-attempt hard lock so the user can try again
 *    with their existing PIN.
 *  - action "reset": issues a brand-new random PIN (unique across the team) and
 *    clears the lock, for when the PIN is forgotten or was never handed over.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const targetUserId = Number(body.userId);
    const action = String(body.action || "");
    if (!targetUserId || !["unlock", "reset"].includes(action)) {
      return NextResponse.json(
        { error: "userId and a valid action are required" },
        { status: 400 }
      );
    }

    const db = getDb();
    const target = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, targetUserId))
      .get();
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (action === "unlock") {
      db.update(schema.users)
        .set({ pinLocked: false, pinFailedCount: 0 })
        .where(eq(schema.users.id, targetUserId))
        .run();

      writeAuditLog({
        category: "settings",
        action: "team_pin_unlocked",
        actorUserId: user.id,
        targetUserId,
        entityType: "user",
        entityId: targetUserId,
        summary: `Unlocked PIN login for ${target.name}.`,
      });

      return NextResponse.json({ ok: true });
    }

    const taken = new Set(
      (db.select({ pin: schema.users.pin }).from(schema.users).all() as {
        pin: string | null;
      }[])
        .map((r) => r.pin)
        .filter((p): p is string => !!p)
    );
    const pin = generatePin(taken);
    if (!pin) {
      return NextResponse.json({ error: "Could not generate a unique PIN" }, { status: 500 });
    }

    db.update(schema.users)
      .set({ pin, pinHash: hashPin(pin), pinLocked: false, pinFailedCount: 0 })
      .where(eq(schema.users.id, targetUserId))
      .run();

    writeAuditLog({
      category: "settings",
      action: "team_pin_reset",
      actorUserId: user.id,
      targetUserId,
      entityType: "user",
      entityId: targetUserId,
      summary: `Reset the login PIN for ${target.name}.`,
    });

    return NextResponse.json({ ok: true, pin });
  } catch (error) {
    console.error("Team PIN action error:", error);
    return NextResponse.json({ error: "Failed to update PIN" }, { status: 500 });
  }
}
