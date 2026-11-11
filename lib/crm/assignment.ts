import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./schema";
import { isCheckedIn } from "./attendance";
import { getAssignmentPointerSm, setAssignmentPointerSm } from "./settings";
import { SKIP_FOR_LOAD_STATUSES, type CrmDb } from "./leads";

export function pickNextCheckedInSmId(
  db: CrmDb,
  opts: { preferredId?: number | null } = {}
): number | null {
  const sms = db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.role, "sales_manager"), eq(schema.users.active, true)))
    .orderBy(schema.users.id)
    .all()
    .filter((u) => isCheckedIn(u.id));

  if (sms.length === 0) return null;

  if (opts.preferredId != null && sms.some((s) => s.id === opts.preferredId)) {
    return opts.preferredId;
  }

  const ordered = [...sms].sort((a, b) => a.id - b.id);
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
  const sms = db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.role, "sales_manager"), eq(schema.users.active, true)))
    .orderBy(schema.users.id)
    .all()
    .filter((u) => isCheckedIn(u.id));

  if (sms.length === 0) return null;

  if (opts.preferredId != null && sms.some((s) => s.id === opts.preferredId)) {
    return opts.preferredId;
  }

  const allLeads = db.select().from(schema.leads).all();
  const openCounts = new Map(sms.map((s) => [s.id, 0]));
  for (const lead of allLeads) {
    if (lead.deletedAt) continue;
    if (lead.assignedSmId != null && openCounts.has(lead.assignedSmId)) {
      if (!SKIP_FOR_LOAD_STATUSES.has(lead.status)) {
        openCounts.set(lead.assignedSmId, openCounts.get(lead.assignedSmId)! + 1);
      }
    }
  }

  const sorted = [...sms].sort((a, b) => {
    const diff = (openCounts.get(a.id) ?? 0) - (openCounts.get(b.id) ?? 0);
    return diff !== 0 ? diff : a.id - b.id;
  });
  return sorted[0].id;
}
