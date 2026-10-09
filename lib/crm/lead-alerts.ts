import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./schema";

type Db = ReturnType<typeof getDb>;

const SOURCE_LABELS: Record<string, string> = {
  meta: "Meta Lead Ad",
  website: "Website",
  walk_in: "Walk-in",
  referral: "Referral",
  other: "Enquiry",
};

/** Human label for a lead source code, or the code itself when unknown. */
export function alertSourceLabel(source: string | null | undefined): string {
  if (!source) return "";
  return SOURCE_LABELS[source] || source;
}

/**
 * Raise a persistent in-app "new lead" alert for one caller.
 *
 * Unlike a web push this is stored, so the popup survives a reload and every
 * open tab agrees on what is still unread. Deduplicated per (user, lead) so a
 * re-delivered webhook or a reactivation cannot pop twice for the same lead.
 *
 * Never throws: the lead is already committed by the time this runs, and a
 * failed alert must not roll back the import.
 */
export function notifyNewLead(
  userId: number | null | undefined,
  lead: { id: number; name: string; source?: string | null },
  opts: { kind?: "new" | "reactivated" } = {}
): void {
  if (userId == null) return;
  try {
    const db = getDb();
    const existing = db
      .select({ id: schema.leadAlerts.id })
      .from(schema.leadAlerts)
      .where(and(eq(schema.leadAlerts.userId, userId), eq(schema.leadAlerts.leadId, lead.id)))
      .get();
    if (existing) return;

    const kind = opts.kind ?? "new";
    const sourceLabel = alertSourceLabel(lead.source);
    db.insert(schema.leadAlerts)
      .values({
        userId,
        leadId: lead.id,
        kind,
        title: kind === "reactivated" ? "Lead re-engaged" : "New lead assigned",
        body: `${lead.name || "New enquiry"}${sourceLabel ? ` - ${sourceLabel}` : ""}`,
        createdAt: new Date().toISOString(),
      })
      .run();
  } catch (err) {
    console.warn("[crm] notifyNewLead failed:", err);
  }
}

export type LeadAlert = {
  id: number;
  leadId: number;
  kind: string;
  title: string;
  body: string;
  createdAt: string;
};

/** Unacknowledged alerts for one user, newest first. */
export function listUnacknowledgedAlerts(db: Db, userId: number, limit = 20): LeadAlert[] {
  return db
    .select({
      id: schema.leadAlerts.id,
      leadId: schema.leadAlerts.leadId,
      kind: schema.leadAlerts.kind,
      title: schema.leadAlerts.title,
      body: schema.leadAlerts.body,
      createdAt: schema.leadAlerts.createdAt,
    })
    .from(schema.leadAlerts)
    .where(and(eq(schema.leadAlerts.userId, userId), isNull(schema.leadAlerts.acknowledgedAt)))
    .orderBy(desc(schema.leadAlerts.createdAt))
    .limit(limit)
    .all();
}

/** Mark alerts acknowledged, scoped to the user so ids cannot be spoofed. */
export function acknowledgeAlerts(db: Db, userId: number, ids: number[]): number {
  if (ids.length === 0) return 0;
  const now = new Date().toISOString();
  let changed = 0;
  for (const id of ids) {
    const res = db
      .update(schema.leadAlerts)
      .set({ acknowledgedAt: now })
      .where(
        and(
          eq(schema.leadAlerts.id, id),
          eq(schema.leadAlerts.userId, userId),
          isNull(schema.leadAlerts.acknowledgedAt)
        )
      )
      .run();
    changed += res.changes;
  }
  return changed;
}

/**
 * Clear every unacknowledged alert for a user. Used by the "mark all read"
 * action, so a caller returning to a pile of stale popups can wipe them at once.
 */
export function acknowledgeAllAlerts(db: Db, userId: number): number {
  const res = db
    .update(schema.leadAlerts)
    .set({ acknowledgedAt: new Date().toISOString() })
    .where(and(eq(schema.leadAlerts.userId, userId), isNull(schema.leadAlerts.acknowledgedAt)))
    .run();
  return res.changes;
}
