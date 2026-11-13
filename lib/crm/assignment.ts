import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./schema";
import { getAssignmentPointerSm, setAssignmentPointerSm } from "./settings";
import { SKIP_FOR_LOAD_STATUSES, type CrmDb } from "./leads";

// New enquiry leads are handed only to Aatish Kini and Priti Tiwari, so the
// rest of the team never receives a fresh website/Meta/CRM enquiry.
const ENQUIRY_ASSIGNEE_EMAILS = new Set([
  "aatish@patangfuturehomes.com",
  "priti@patangfuturehomes.com",
]);

export function pickNextCheckedInSmId(
  db: CrmDb,
  opts: { preferredId?: number | null } = {}
): number | null {
  const eligible = db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.role, "sales_manager"), eq(schema.users.active, true)))
    .orderBy(schema.users.id)
    .all()
    .filter((u) => ENQUIRY_ASSIGNEE_EMAILS.has((u.email || "").toLowerCase()));

  // Skip the check-in/check-out gating: every active designated assignee is
  // eligible regardless of attendance, so leads are handed out one by one
  // (round-robin) instead of stalling when nobody has checked in.
  const pool = eligible;

  if (pool.length === 0) return null;

  if (opts.preferredId != null && pool.some((s) => s.id === opts.preferredId)) {
    return opts.preferredId;
  }

  const ordered = [...pool].sort((a, b) => a.id - b.id);
  const pointer = getAssignmentPointerSm();
  const start =
    pointer == null ? 0 : Math.max(0, ordered.findIndex((s) => s.id === pointer) + 1);
  const rotated = [...ordered.slice(start), ...ordered.slice(0, start)];
  const pick = rotated[0];
  setAssignmentPointerSm(pick.id);
  return pick.id;
}

export function resolveDefaultCallerId(
  db: CrmDb,
  opts: { preferredId?: number | null } = {}
): number | null {
  return pickNextCheckedInSmId(db, opts);
}

export function pickRandomCallerId(db: CrmDb): number | null {
  return pickNextCheckedInSmId(db);
}

export function resolveDefaultSmId(
  db: CrmDb,
  opts: { preferredId?: number | null } = {}
): number | null {
  // Skip the check-in/check-out gating: every active sales manager is eligible
  // regardless of attendance, so assignment never dead-ends and leads are
  // distributed one by one.
  const pool = db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.role, "sales_manager"), eq(schema.users.active, true)))
    .orderBy(schema.users.id)
    .all();

  if (pool.length === 0) return null;

  if (opts.preferredId != null && pool.some((s) => s.id === opts.preferredId)) {
    return opts.preferredId;
  }

  const allLeads = db.select().from(schema.leads).all();
  const openCounts = new Map(pool.map((s) => [s.id, 0]));
  for (const lead of allLeads) {
    if (lead.deletedAt) continue;
    if (lead.assignedSmId != null && openCounts.has(lead.assignedSmId)) {
      if (!SKIP_FOR_LOAD_STATUSES.has(lead.status)) {
        openCounts.set(lead.assignedSmId, openCounts.get(lead.assignedSmId)! + 1);
      }
    }
  }

  const sorted = [...pool].sort((a, b) => {
    const diff = (openCounts.get(a.id) ?? 0) - (openCounts.get(b.id) ?? 0);
    return diff !== 0 ? diff : a.id - b.id;
  });
  return sorted[0].id;
}
