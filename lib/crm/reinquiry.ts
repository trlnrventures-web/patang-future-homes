import { getDb } from "./db";
import * as schema from "./schema";
import { eq, or } from "drizzle-orm";
import { resolveDefaultCallerId, type CrmDb } from "./leads";

/**
 * A re-inquiry is a second (or duplicate) enquiry for the same phone number.
 * - If an ACTIVE lead exists, we do NOT create another one — we record the
 *   fresh enquiry as an activity on the existing lead.
 * - If an old lead is Nurture/Lost/Invalid/DNC or soft-deleted, we REACTIVATE
 *   it (status -> new, back in the caller queue) preserving its full history.
 */

const REACTIVATABLE_STATUSES = new Set(["lost", "invalid", "dnc", "nurture"]);

function stripDigits(raw: string | null | undefined): string {
  return (raw || "").replace(/\D/g, "");
}

function isActiveLead(l: { status: string; deletedAt: string | null }): boolean {
  return !l.deletedAt && !REACTIVATABLE_STATUSES.has(l.status);
}

export type ReInquiryResult =
  | { kind: "new"; lead: typeof schema.leads.$inferSelect }
  | { kind: "duplicate"; lead: typeof schema.leads.$inferSelect; status: string }
  | { kind: "reactivated"; lead: typeof schema.leads.$inferSelect; fromStatus: string };

export function handleReInquiry(input: {
  db?: CrmDb;
  phone: string;
  project?: string | null;
  message?: string;
  source: string;
  userId?: number | null;
  insertLead: (db: CrmDb) => typeof schema.leads.$inferSelect;
}): ReInquiryResult {
  const db = input.db || getDb();
  const now = new Date().toISOString();
  const phoneDigits = stripDigits(input.phone);

  const existingRows = db
    .select()
    .from(schema.leads)
    .where(
      or(
        eq(schema.leads.phone, input.phone),
        eq(schema.leads.whatsappNumber, input.phone),
      ),
    )
    .all();

  const matches = existingRows.filter(
    (l) => stripDigits(l.phone) === phoneDigits || stripDigits(l.whatsappNumber) === phoneDigits
  );

  const active = matches.find(isActiveLead);
  let actorId = input.userId ?? null;
  if (actorId == null) {
    const fallbackActor = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.role, "admin"))
      .all()[0];
    actorId = fallbackActor?.id ?? null;
  }
  if (actorId == null) {
    const fallbackActor = db.select({ id: schema.users.id }).from(schema.users).all()[0];
    actorId = fallbackActor?.id ?? null;
  }

  // Active lead already in the pipeline -> just log the fresh enquiry.
  if (active) {
    const note = [
      "New enquiry received",
      input.project ? `: ${input.project}` : "",
      ` via ${input.source}`,
    ].join("");
    db.insert(schema.activities)
      .values({
        leadId: active.id,
        userId: actorId ?? 1,
        type: "note",
        notes: input.message ? `${note}. Message: ${input.message}` : note,
        createdAt: now,
      })
      .run();
    return { kind: "duplicate", lead: active, status: active.status };
  }

  // Found a reactivatable/deleted lead -> reactivate it.
  if (matches.length > 0) {
    const target = matches[0];
    const fromStatus = target.deletedAt ? "deleted" : target.status;
    const callerId = resolveDefaultCallerId(db);

    db.update(schema.leads)
      .set({
        status: "new",
        stageChangedAt: now,
        deletedAt: null,
        assignedCallerId: callerId,
        assignedSmId: null,
        assignedAt: null,
        assignedBy: null,
        nextFollowUp: null,
        nextAttemptAt: null,
        reactivatedAt: now,
        reactivatedFrom: fromStatus,
        updatedAt: now,
      })
      .where(eq(schema.leads.id, target.id))
      .run();

    db.insert(schema.activities)
      .values({
        leadId: target.id,
        userId: actorId ?? 1,
        type: "status_change",
        notes: `Lead reactivated: customer re-enquired via ${input.source} on ${now.slice(0, 10)}, previous status was ${fromStatus === "deleted" ? "Deleted" : fromStatus}.`,
        createdAt: now,
      })
      .run();

    const refreshed = db.select().from(schema.leads).where(eq(schema.leads.id, target.id)).get()!;
    return { kind: "reactivated", lead: refreshed, fromStatus };
  }

  // No match -> brand new lead.
  return { kind: "new", lead: input.insertLead(db) };
}