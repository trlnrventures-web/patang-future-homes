import { NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { isNull } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import { formatLeadAge } from "@/lib/crm/sla";
import { istToday, istDayRange } from "@/lib/crm/reports";
import { CALLER_ACTIVITY_KEYS, inCallerBook } from "@/lib/crm/leads";
import { loadPastNotes, requirementLines } from "@/lib/crm/call-queue-shared";
import type { CallQueueItem } from "@/lib/crm/call-queue-shared";
import { contactMaskFor, maskPhone, describeMasking } from "@/lib/crm/office-hours";

/**
 * Quality lineup for callers: the leads still worth a call right now.
 *
 * Excluded on purpose:
 *  - anything called today or yesterday (they have had their chance today)
 *  - anything with a site visit on the books, upcoming or already done
 *  - anything booked
 *
 * Same item shape as the call queue, so the caller can work the list from the
 * dashboard or run it as a calling session.
 */

/** "call" and every "call_*" outcome. A note is not a call. */
const CALL_TYPES = new Set(CALLER_ACTIVITY_KEYS.filter((k) => k === "call" || k.startsWith("call_")));

const BOOKING_ACTIVITY_TYPES = new Set(["booking", "booking_created", "booking_confirmed"]);

/** Closed out, already in the visit pipeline, or already negotiating. */
const OUT_OF_POOL_STATUSES = new Set([
  "invalid",
  "lost",
  "dnc",
  "booked",
  "visit_proposed",
  "visit_booked",
  "visit_confirmed",
  "visit_done",
  "negotiation",
]);

/** A visit that fell through leaves the lead back in the calling pool. */
const VOID_VISIT_STATUSES = new Set(["cancelled", "no_show"]);
const VISITED_STATUSES = new Set(["arrived", "visit_done"]);

const MAX_QUEUE = 100;

export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "caller") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const today = istToday();
  const { from: dayFrom, to: dayTo } = istDayRange(today);
  const decision = contactMaskFor(user);
  // Start of yesterday, so "called today or yesterday" is one comparison.
  const callCutoff = new Date(new Date(dayFrom).getTime() - 86400000).toISOString();

  const activities = db.select().from(schema.activities).all();

  const calledRecently = new Set<number>();
  const booked = new Set<number>();
  for (const a of activities) {
    if (CALL_TYPES.has(a.type) && a.createdAt >= callCutoff) {
      calledRecently.add(a.leadId);
    }
    if (BOOKING_ACTIVITY_TYPES.has(a.type)) {
      booked.add(a.leadId);
    }
  }

  for (const b of db.select().from(schema.bookings).all()) {
    if (b.status !== "cancelled") booked.add(b.leadId);
  }

  const visitBlocked = new Set<number>();
  for (const v of db.select().from(schema.siteVisits).all()) {
    if (VOID_VISIT_STATUSES.has(v.status)) continue;
    const visited = VISITED_STATUSES.has(v.status);
    // site_visits.date is YYYY-MM-DD, so a string compare is a date compare.
    const upcoming = v.date >= today;
    if (visited || upcoming) visitBlocked.add(v.leadId);
  }

  const myLeads = db
    .select()
    .from(schema.leads)
    .where(isNull(schema.leads.deletedAt))
    .all()
    .filter((l) => inCallerBook(l, user.id));

  const candidates = myLeads.filter(
    (l) => !OUT_OF_POOL_STATUSES.has(l.status) && !calledRecently.has(l.id) && !booked.has(l.id) && !visitBlocked.has(l.id)
  );

  // Best score first, then the freshest lead, so a caller works down a
  // sensible list instead of an arbitrary id order.
  candidates.sort(
    (a, b) =>
      (b.leadScore ?? 0) - (a.leadScore ?? 0) ||
      (b.createdAt || "").localeCompare(a.createdAt || "") ||
      b.id - a.id
  );

  // The dashboard only needs a page for the list; the calling session pulls a
  // bigger page. total is always the real count, so the UI can say so.
  const rawLimit = Number(new URL(req.url).searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), MAX_QUEUE) : MAX_QUEUE;

  const total = candidates.length;
  const page = candidates.slice(0, limit);
  const pastNotesByLead = loadPastNotes(
    db,
    page.map((l) => l.id)
  );

  const nowMs = Date.now();
  const queue: CallQueueItem[] = page.map((l) => {
    const dueIso = l.nextFollowUp || l.nextAttemptAt || null;
    let priorityGroup: CallQueueItem["priorityGroup"] = "new";
    if (dueIso) {
      const dueMs = new Date(dueIso).getTime();
      if (!Number.isNaN(dueMs)) {
        if (dueMs < nowMs) priorityGroup = "overdue";
        else if (dueIso >= dayFrom && dueIso < dayTo) priorityGroup = "due_today";
      }
    }
    const pastNotes = pastNotesByLead.get(l.id) || [];
    return {
      id: l.id,
      name: l.name,
      // Same office-hours masking as the due/overdue queue, which shares the
      // CallQueue UI.
      phone: decision.mask ? maskPhone(l.phone) : l.phone,
      secondaryPhone: decision.mask ? maskPhone(l.secondaryPhone) : l.secondaryPhone,
      whatsappNumber: decision.mask ? maskPhone(l.whatsappNumber) : l.whatsappNumber,
      contactHidden: decision.mask,
      status: l.status,
      priorityGroup,
      dueIso,
      requirementLines: requirementLines(l),
      lastNote: pastNotes[0]?.notes || "",
      pastNotes,
      leadAge: formatLeadAge(l.createdAt),
      attemptCount: l.attemptCount ?? 0,
    };
  });

  return NextResponse.json({ queue, total, contactMasking: describeMasking(decision) });
}
