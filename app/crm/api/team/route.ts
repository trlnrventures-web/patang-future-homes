import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq } from "drizzle-orm";
import { getAuthUser, invalidateLeadAccessCache, isAdmin } from "@/lib/crm/auth";
import { writeAuditLog } from "@/lib/crm/audit";
import { DEFAULT_WEEK_OFF_DAY } from "@/lib/crm/attendance";
import {
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
} from "@/lib/crm/identifiers";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const users = db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      phone: schema.users.phone,
      active: schema.users.active,
      weekOffDay: schema.users.weekOffDay,
      baseSalary: schema.users.baseSalary,
      seeAllLeads: schema.users.seeAllLeads,
      pin: schema.users.pin,
      pinLocked: schema.users.pinLocked,
      pinFailedCount: schema.users.pinFailedCount,
      available: schema.users.available,
      unavailableFrom: schema.users.unavailableFrom,
      unavailableTo: schema.users.unavailableTo,
      unavailableNote: schema.users.unavailableNote,
      routingTier: schema.users.routingTier,
      dailyVisitCap: schema.users.dailyVisitCap,
    })
    .from(schema.users)
    .all()
    .map((u) => ({
      ...u,
      weekOffDay: u.weekOffDay || DEFAULT_WEEK_OFF_DAY,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ users });
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const targetUserId = Number(body.userId);
    if (!targetUserId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const db = getDb();
    const target = db.select().from(schema.users).where(eq(schema.users.id, targetUserId)).get();
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    // Email and phone are both login identifiers, so changing one of them
    // changes how that person gets in and where their reset link lands. Both
    // are therefore held to the same uniqueness rule the login lookup assumes:
    // an identifier resolves to exactly one account.
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
      if (taken && taken.id !== targetUserId) {
        return NextResponse.json(
          { error: "That email is already used by another account" },
          { status: 400 }
        );
      }
      if (email !== target.email) {
        updates.email = email;
        // A reset link already in flight was delivered to the address that is
        // no longer theirs, so it stops working here rather than outliving the
        // change.
        updates.passwordResetTokenHash = null;
        updates.passwordResetExpiresAt = null;
      }
    }

    if (body.phone !== undefined) {
      const raw = String(body.phone ?? "").trim();
      if (raw === "") {
        updates.phone = null;
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
        if (taken && taken.id !== targetUserId) {
          return NextResponse.json(
            { error: "That phone number is already used by another account" },
            { status: 400 }
          );
        }
        updates.phone = phone;
      }
    }

    if (body.baseSalary !== undefined) {
      const salary = body.baseSalary === null ? null : Number(body.baseSalary);
      if (salary !== null && (!Number.isFinite(salary) || salary < 0)) {
        return NextResponse.json({ error: "Invalid salary" }, { status: 400 });
      }
      updates.baseSalary = salary;
    }

    if (body.weekOffDay !== undefined) {
      const validDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      if (!validDays.includes(body.weekOffDay)) {
        return NextResponse.json({ error: "Invalid week-off day" }, { status: 400 });
      }
      updates.weekOffDay = body.weekOffDay;
    }

    if (body.active !== undefined) {
      updates.active = Boolean(body.active);
    }

    // ---- Routing availability --------------------------------------------
    if (body.available !== undefined) {
      updates.available = Boolean(body.available);
    }
    if (body.unavailableFrom !== undefined) {
      updates.unavailableFrom = body.unavailableFrom ? String(body.unavailableFrom) : null;
    }
    if (body.unavailableTo !== undefined) {
      updates.unavailableTo = body.unavailableTo ? String(body.unavailableTo) : null;
    }
    if (body.unavailableNote !== undefined) {
      updates.unavailableNote = body.unavailableNote ? String(body.unavailableNote) : null;
    }
    if (body.routingTier !== undefined) {
      const tier = String(body.routingTier);
      if (!["commission", "salaried", "none"].includes(tier)) {
        return NextResponse.json({ error: "Invalid routing tier" }, { status: 400 });
      }
      if (tier !== "none" && target.role !== "sales_manager") {
        return NextResponse.json({ error: "Only sales managers can be routed leads" }, { status: 400 });
      }
      updates.routingTier = tier;
    }
    if (body.dailyVisitCap !== undefined) {
      const cap = body.dailyVisitCap === null ? null : Number(body.dailyVisitCap);
      if (cap !== null && (!Number.isFinite(cap) || cap < 1)) {
        return NextResponse.json({ error: "Daily visit cap must be at least 1" }, { status: 400 });
      }
      updates.dailyVisitCap = cap;
    }

    // Read access to the whole lead book. Sales-only: it is a scoping override
    // for staff who work follow-up, so there is nothing to widen for admin,
    // sales_head or marketing, and they already see everything anyway.
    if (body.seeAllLeads !== undefined) {
      const flag = Boolean(body.seeAllLeads);
      if (flag && !["caller", "sales_manager"].includes(target.role)) {
        return NextResponse.json(
          { error: "Only callers and sales managers can be given full lead visibility" },
          { status: 400 }
        );
      }
      updates.seeAllLeads = flag;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
    }

    db.update(schema.users)
      .set(updates)
      .where(eq(schema.users.id, targetUserId))
      .run();

    // Deactivate-only lifecycle: an inactive user keeps every row they touched
    // for history, but their open leads go back to the pool and they stop
    // receiving routed work.
    if (body.active === false) {
      db.update(schema.users)
        .set({ routingTier: "none", available: false })
        .where(eq(schema.users.id, targetUserId))
        .run();
      const openLeads = db
        .select()
        .from(schema.leads)
        .where(eq(schema.leads.assignedSmId, targetUserId))
        .all()
        .filter((l) => !l.deletedAt && !["booked", "lost", "invalid", "dnc"].includes(l.status));
      for (const lead of openLeads) {
        db.update(schema.leads)
          .set({ assignedSmId: null, nextAction: "review_assignment", updatedAt: new Date().toISOString() })
          .where(eq(schema.leads.id, lead.id))
          .run();
      }
      writeAuditLog({
        category: "data",
        action: "user_deactivated",
        actorUserId: user.id,
        targetUserId,
        entityType: "user",
        entityId: targetUserId,
        summary: `Deactivated ${target.name}; ${openLeads.length} open lead(s) returned to the assignment pool.`,
      });
    }

    if (body.seeAllLeads !== undefined) {
      invalidateLeadAccessCache();
    }

    const changes = Object.keys(updates)
      .map((k) => `${k}: ${updates[k]}`)
      .join(", ");

    writeAuditLog({
      category: "attendance",
      action: "team_member_updated",
      actorUserId: user.id,
      targetUserId,
      entityType: "user",
      entityId: targetUserId,
      summary: `Updated ${target.name}'s profile: ${changes}.`,
      details: updates,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Team PATCH error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

/**
 * Deactivate-only lifecycle: a hard delete is refused whenever the account has
 * history, because deleting it would orphan leads, visits and the audit trail.
 */
export async function DELETE(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await request.json();
    const targetUserId = Number(body.userId);
    if (!targetUserId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    if (targetUserId === user.id) {
      return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
    }
    const db = getDb();
    const target = db.select().from(schema.users).where(eq(schema.users.id, targetUserId)).get();
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const counts = {
      leads: db.select().from(schema.leads).all().filter((l) => l.assignedSmId === targetUserId || l.assignedCallerId === targetUserId).length,
      activities: db.select().from(schema.activities).all().filter((a) => a.userId === targetUserId).length,
      visits: db.select().from(schema.siteVisits).all().filter((v) => v.smId === targetUserId).length,
      followUps: db.select().from(schema.followUps).all().filter((f) => f.userId === targetUserId).length,
      messages: db.select().from(schema.messageLogs).all().filter((m) => m.userId === targetUserId).length,
    };
    const blockers = Object.entries(counts).filter(([, n]) => n > 0);
    if (blockers.length > 0) {
      return NextResponse.json(
        {
          error:
            "Hard delete is blocked because this account has history. Deactivate it instead so the records stay readable as 'Former team member'.",
          references: counts,
        },
        { status: 409 },
      );
    }

    db.delete(schema.users).where(eq(schema.users.id, targetUserId)).run();
    writeAuditLog({
      category: "data",
      action: "user_deleted",
      actorUserId: user.id,
      targetUserId,
      entityType: "user",
      entityId: targetUserId,
      summary: `Hard-deleted ${target.name} (no lead or activity history).`,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Team DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
