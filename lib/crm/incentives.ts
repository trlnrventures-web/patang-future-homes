import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./schema";
import { writeAuditLog, getUserName } from "./audit";
import { getProject } from "../projects";
import { getSetting, updateSetting } from "./settings";

export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export type LadderTier = { threshold: number; rate: number };

/** Which side of a booking a ladder pays out. Also the key it is stored under. */
export type LadderKey = "sm" | "caller";

export type IncentiveLadder = {
  key: LadderKey;
  label: string;
  tiers: LadderTier[];
  capped: boolean;
};

// ---- Defaults ----
//
// These are the fallback, not the live configuration. An admin can change the
// tiers from Settings > Incentive Rates, which stores them in `crm_settings`
// under `incentive_ladders`; `getIncentiveLadders()` prefers that and only
// falls back here. Keeping the shipped numbers in one place means a fresh
// install with no setting row behaves exactly as it did before.
export const DEFAULT_SM_INCENTIVE_LADDER: IncentiveLadder = {
  key: "sm",
  label: "Sales Manager",
  capped: true,
  tiers: [
    { threshold: 1, rate: 5000 },
    { threshold: 2, rate: 7000 },
    { threshold: 3, rate: 10000 },
    { threshold: 4, rate: 12000 },
    { threshold: 5, rate: 15000 },
  ],
};

export const DEFAULT_CALLER_INCENTIVE_LADDER: IncentiveLadder = {
  key: "caller",
  label: "Caller",
  capped: true,
  tiers: [
    { threshold: 1, rate: 2000 },
    { threshold: 5, rate: 2500 },
    { threshold: 10, rate: 3000 },
  ],
};

export const DEFAULT_INCENTIVE_LADDERS: Record<LadderKey, IncentiveLadder> = {
  sm: DEFAULT_SM_INCENTIVE_LADDER,
  caller: DEFAULT_CALLER_INCENTIVE_LADDER,
};

/** Human name per role, so the editor and the audit log agree on wording. */
export const LADDER_LABELS: Record<LadderKey, string> = {
  sm: "Sales Manager",
  caller: "Caller",
};

export const LADDER_KEYS: LadderKey[] = ["sm", "caller"];

const LADDER_SETTING_KEY = "incentive_ladders";

/**
 * Coerce one stored ladder, falling back to the default whenever the value is
 * not a usable tier list. Bad config must never be able to make a rate `NaN` or
 * silently pay everyone nothing, so anything unparseable is discarded wholesale
 * rather than patched up.
 */
function parseLadder(raw: unknown, key: LadderKey): IncentiveLadder {
  const fallback = DEFAULT_INCENTIVE_LADDERS[key];
  if (!raw || typeof raw !== "object") return fallback;

  const obj = raw as Partial<IncentiveLadder>;
  const tiers: LadderTier[] = [];
  const seen = new Set<number>();

  if (Array.isArray(obj.tiers)) {
    for (const t of obj.tiers) {
      const threshold = Number((t as LadderTier)?.threshold);
      const rate = Number((t as LadderTier)?.rate);
      if (!Number.isInteger(threshold) || threshold < 1) continue;
      if (!Number.isFinite(rate) || rate < 0) continue;
      if (seen.has(threshold)) continue;
      seen.add(threshold);
      tiers.push({ threshold, rate });
    }
  }

  // An empty list would mean "nobody ever earns anything", which is never what
  // an admin meant, so treat it as unset.
  if (tiers.length === 0) return fallback;

  // `rateForCount` scans from the top down, so ascending order is what makes
  // "the highest tier reached" resolve correctly.
  tiers.sort((a, b) => a.threshold - b.threshold);

  return {
    key,
    label: typeof obj.label === "string" && obj.label.trim() ? obj.label.trim() : fallback.label,
    tiers,
    capped: obj.capped !== false,
  };
}

export function parseIncentiveLadders(raw: string | null | undefined): Record<LadderKey, IncentiveLadder> {
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  const obj = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  return {
    sm: parseLadder(obj.sm, "sm"),
    caller: parseLadder(obj.caller, "caller"),
  };
}

/** The live ladders. One DB read, so callers should fetch once and pass down. */
export function getIncentiveLadders(): Record<LadderKey, IncentiveLadder> {
  return parseIncentiveLadders(getSetting(LADDER_SETTING_KEY));
}

export function serializeIncentiveLadders(ladders: Record<LadderKey, IncentiveLadder>): string {
  const out: Record<string, unknown> = {};
  for (const key of LADDER_KEYS) {
    const l = parseLadder(ladders[key], key);
    out[key] = { label: l.label, capped: l.capped, tiers: l.tiers };
  }
  return JSON.stringify(out);
}

/**
 * Persist the ladders and record who changed them. The audit entry carries the
 * before and after figures because an incentive ladder feeds salary, so a rate
 * change is a payroll-affecting event and has to be reconstructible later.
 */
export function saveIncentiveLadders(
  next: Record<LadderKey, IncentiveLadder>,
  byUserId: number
): Record<LadderKey, IncentiveLadder> {
  const previous = getIncentiveLadders();
  const sanitized = {
    sm: parseLadder(next.sm, "sm"),
    caller: parseLadder(next.caller, "caller"),
  };
  updateSetting(LADDER_SETTING_KEY, serializeIncentiveLadders(sanitized));
  writeAuditLog({
    category: "incentive",
    action: "incentive_ladders_updated",
    actorUserId: byUserId,
    entityType: "settings",
    entityId: LADDER_SETTING_KEY,
    summary: `Incentive rates updated - SM: ${sanitized.sm.tiers.map((t) => `${t.threshold}+ = Rs${t.rate}`).join(", ")}; Caller: ${sanitized.caller.tiers.map((t) => `${t.threshold}+ = Rs${t.rate}`).join(", ")}.`,
    details: {
      previous: {
        sm: previous.sm.tiers,
        caller: previous.caller.tiers,
      },
      next: { sm: sanitized.sm.tiers, caller: sanitized.caller.tiers },
    },
  });
  return sanitized;
}

/** Rate per unit once a tier is crossed (applies retroactively to ALL units that month). */
export function rateForCount(ladder: IncentiveLadder, count: number): number {
  if (count <= 0) return 0;
  for (let i = ladder.tiers.length - 1; i >= 0; i--) {
    const tier = ladder.tiers[i];
    if (count >= tier.threshold) return tier.rate;
  }
  return 0;
}

export function smRate(count: number, ladder?: IncentiveLadder): number {
  return rateForCount(ladder ?? getIncentiveLadders().sm, count);
}

export function callerRate(count: number, ladder?: IncentiveLadder): number {
  return rateForCount(ladder ?? getIncentiveLadders().caller, count);
}

export function smIncentiveTotal(count: number, ladder?: IncentiveLadder): number {
  return count * smRate(count, ladder);
}

export function callerIncentiveTotal(count: number, ladder?: IncentiveLadder): number {
  return count * callerRate(count, ladder);
}

function formatRs(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

/** e.g. "3 bookings this month, ₹10,000 each. One more booking unlocks ₹12,000 each for all 4." */
export function unlockNextHint(ladder: IncentiveLadder, count: number, unitLabel = "booking"): string {
  const rate = rateForCount(ladder, count);
  if (count === 0) {
    const first = ladder.tiers[0];
    return `No ${unitLabel}s this month yet. The first ${unitLabel} will unlock ${formatRs(first.rate)} each.`;
  }
  const cappedMsg = `You're at the top tier: ${formatRs(rate)} each (capped).`;
  if (ladder.capped) {
    const top = ladder.tiers[ladder.tiers.length - 1];
    if (count >= top.threshold) return cappedMsg;
  }
  const next = ladder.tiers.find((t) => t.threshold > count);
  if (!next) return cappedMsg;
  const needed = next.threshold - count;
  const plural = needed === 1 ? "" : "s";
  return `${count} ${unitLabel}${count === 1 ? "" : "s"} this month, ${formatRs(rate)} each. ${needed} more ${unitLabel}${plural} unlock${needed === 1 ? "s" : ""} ${formatRs(next.rate)} each for all ${next.threshold}.`;
}

export function smHint(count: number, ladder?: IncentiveLadder): string {
  return unlockNextHint(ladder ?? getIncentiveLadders().sm, count);
}

export function callerHint(count: number, ladder?: IncentiveLadder): string {
  return unlockNextHint(ladder ?? getIncentiveLadders().caller, count, "unit");
}

// ---- Month helpers (IST calendar month) ----
export function istMonthKey(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const ist = new Date(dt.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentMonthKey(now: Date = new Date()): string {
  return istMonthKey(now);
}

type BookingRow = {
  id: number;
  leadId: number;
  smId: number | null;
  bookingDate: string;
  status: string;
  callerId: number | null;
};

/**
 * Confirmed bookings for a calendar month, mapped to their SM and qualifying
 * Caller (via lead).
 *
 * A booking is "closed" when either (a) a confirmed row exists in the bookings
 * module, or (b) the lead itself is marked status "booked" (the old flow that
 * predates the bookings module). The two sources are merged and de-duplicated
 * by lead so rankings and incentives never double count.
 */
export function confirmedBookingsForMonth(month: string, now: Date = new Date()): BookingRow[] {
  const db = getDb();

  const leads = db
    .select({
      id: schema.leads.id,
      status: schema.leads.status,
      assignedCallerId: schema.leads.assignedCallerId,
      assignedSmId: schema.leads.assignedSmId,
      createdAt: schema.leads.createdAt,
      updatedAt: schema.leads.updatedAt,
    })
    .from(schema.leads)
    .where(isNull(schema.leads.deletedAt))
    .all();
  const callerById = new Map(leads.map((l) => [l.id, l.assignedCallerId]));

  const allConfirmedBookings = db
    .select({
      id: schema.bookings.id,
      leadId: schema.bookings.leadId,
      smId: schema.bookings.smId,
      bookingDate: schema.bookings.bookingDate,
      status: schema.bookings.status,
    })
    .from(schema.bookings)
    .all()
    .filter((b) => b.status === "confirmed");

  const fromBookingsModule = allConfirmedBookings.filter(
    (b) => istMonthKey(b.bookingDate) === month
  );

  // De-duplicate against the legacy lead-status fallback across ALL months, not
  // just this one. Otherwise a lead with a confirmed booking in one month would
  // also be counted in whichever month its updated_at falls.
  const countedLeadIds = new Set(allConfirmedBookings.map((b) => b.leadId));

  const fromLeadStatus = leads
    .filter((l) => l.status === "booked" && !countedLeadIds.has(l.id))
    .map((l) => ({
      id: -l.id,
      leadId: l.id,
      smId: l.assignedSmId,
      bookingDate: l.updatedAt || l.createdAt || now.toISOString(),
      status: "confirmed",
    }));

  return [...fromBookingsModule, ...fromLeadStatus].map((b) => ({
    ...b,
    callerId: callerById.get(b.leadId) ?? null,
  }));
}

export type IncentiveEntry = {
  userId: number;
  name: string;
  role: "sales_manager" | "caller";
  count: number;
  rate: number;
  total: number;
  hint: string;
  ladder: IncentiveLadder;
  paid: { amount: number; paidAt: string | null } | null;
  outstanding: number;
};

export function getUserIncentiveForMonth(userId: number, month: string): IncentiveEntry | null {
  const db = getDb();
  const user = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!user) return null;

  const ladders = getIncentiveLadders();

  const paid = db
    .select()
    .from(schema.incentivePayments)
    .where(and(eq(schema.incentivePayments.userId, userId), eq(schema.incentivePayments.month, month)))
    .get();

  if (user.role === "sales_manager") {
    const count = confirmedBookingsForMonth(month).filter((b) => b.smId === userId).length;
    const rate = smRate(count, ladders.sm);
    const total = smIncentiveTotal(count, ladders.sm);
    return {
      userId,
      name: user.name,
      role: "sales_manager",
      count,
      rate,
      total,
      hint: smHint(count, ladders.sm),
      ladder: ladders.sm,
      paid: paid ? { amount: paid.amount, paidAt: paid.paidAt || null } : null,
      outstanding: paid ? Math.max(0, total - paid.amount) : total,
    };
  }

  if (user.role === "caller") {
    const count = confirmedBookingsForMonth(month).filter((b) => b.callerId === userId).length;
    const rate = callerRate(count, ladders.caller);
    const total = callerIncentiveTotal(count, ladders.caller);
    return {
      userId,
      name: user.name,
      role: "caller",
      count,
      rate,
      total,
      hint: callerHint(count, ladders.caller),
      ladder: ladders.caller,
      paid: paid ? { amount: paid.amount, paidAt: paid.paidAt || null } : null,
      outstanding: paid ? Math.max(0, total - paid.amount) : total,
    };
  }

  return null;
}

/** All qualifying SMs + Callers for a month, ranked by total incentive (SMs) or units (Callers). */
export function getMonthlyIncentives(month: string, now: Date = new Date()): IncentiveEntry[] {
  const db = getDb();
  const rows = confirmedBookingsForMonth(month, now);
  const ladders = getIncentiveLadders();

  const smCounts = new Map<number, number>();
  for (const b of rows) {
    if (b.smId == null) continue;
    smCounts.set(b.smId, (smCounts.get(b.smId) ?? 0) + 1);
  }

  const callerCounts = new Map<number, number>();
  for (const b of rows) {
    if (b.callerId != null) callerCounts.set(b.callerId, (callerCounts.get(b.callerId) ?? 0) + 1);
  }

  const userIds = new Set<number>([...smCounts.keys(), ...callerCounts.keys()]);
  const users = db.select().from(schema.users).all();
  const userById = new Map(users.map((u) => [u.id, u]));
  const payments = db
    .select()
    .from(schema.incentivePayments)
    .where(eq(schema.incentivePayments.month, month))
    .all();

  const entries: IncentiveEntry[] = [];
  for (const uid of userIds) {
    const u = userById.get(uid);
    if (!u) continue;
    const paid = payments.find((p) => p.userId === uid);
    if (u.role === "sales_manager") {
      const count = smCounts.get(uid) ?? 0;
      const rate = smRate(count, ladders.sm);
      const total = smIncentiveTotal(count, ladders.sm);
      entries.push({
        userId: uid,
        name: u.name,
        role: "sales_manager",
        count,
        rate,
        total,
        hint: smHint(count, ladders.sm),
        ladder: ladders.sm,
        paid: paid ? { amount: paid.amount, paidAt: paid.paidAt || null } : null,
        outstanding: paid ? Math.max(0, total - paid.amount) : total,
      });
    } else if (u.role === "caller") {
      const count = callerCounts.get(uid) ?? 0;
      const rate = callerRate(count, ladders.caller);
      const total = callerIncentiveTotal(count, ladders.caller);
      entries.push({
        userId: uid,
        name: u.name,
        role: "caller",
        count,
        rate,
        total,
        hint: callerHint(count, ladders.caller),
        ladder: ladders.caller,
        paid: paid ? { amount: paid.amount, paidAt: paid.paidAt || null } : null,
        outstanding: paid ? Math.max(0, total - paid.amount) : total,
      });
    }
  }

  const rank = (a: IncentiveEntry, b: IncentiveEntry) => b.total - a.total;
  return entries.sort(rank);
}

/** Ranked SM leaderboard for a month (bookings count + incentive earned). */
export function getSmLeaderboard(month: string): IncentiveEntry[] {
  return getMonthlyIncentives(month).filter((e) => e.role === "sales_manager");
}

export function markIncentivePaid(userId: number, month: string, role: string, byUserId: number): { amount: number; paidAt: string } {
  const entry = getUserIncentiveForMonth(userId, month);
  const amount = entry ? entry.total : 0;
  const db = getDb();
  const paidAt = new Date().toISOString();
  const existing = db
    .select()
    .from(schema.incentivePayments)
    .where(and(eq(schema.incentivePayments.userId, userId), eq(schema.incentivePayments.month, month)))
    .get();
  const previous = existing
    ? { amount: existing.amount, paidAt: existing.paidAt, paidBy: existing.paidBy, role: existing.role }
    : null;
  if (existing) {
    db.update(schema.incentivePayments)
      .set({ amount, paidAt, paidBy: byUserId, role })
      .where(eq(schema.incentivePayments.id, existing.id))
      .run();
  } else {
    db.insert(schema.incentivePayments)
      .values({ userId, month, role, amount, paidBy: byUserId, paidAt })
      .run();
  }
  writeAuditLog({
    category: "incentive",
    action: previous ? "incentive_paid_updated" : "incentive_marked_paid",
    actorUserId: byUserId,
    targetUserId: userId,
    entityType: "incentive_payment",
    entityId: existing?.id ?? `${userId}:${month}`,
    summary: `${previous ? "Updated" : "Marked"} ${getUserName(userId) ?? `User #${userId}`}'s ${month} incentive as paid (₹${amount.toLocaleString("en-IN")}).`,
    details: { month, role, amount, previous },
  });
  return { amount, paidAt };
}

/**
 * Reverse a paid incentive back to pending (admin only).
 * Deletes the payment row so the month reads as outstanding again, and records
 * who reversed it, when, and the previous status in the audit log.
 */
export function markIncentiveUnpaid(
  userId: number,
  month: string,
  byUserId: number
): { ok: boolean; previous: { amount: number; paidAt: string | null; paidBy: number | null; role: string } | null } {
  const db = getDb();
  const existing = db
    .select()
    .from(schema.incentivePayments)
    .where(and(eq(schema.incentivePayments.userId, userId), eq(schema.incentivePayments.month, month)))
    .get();

  if (!existing) return { ok: false, previous: null };

  const previous = {
    amount: existing.amount,
    paidAt: existing.paidAt || null,
    paidBy: existing.paidBy ?? null,
    role: existing.role,
  };

  db.delete(schema.incentivePayments).where(eq(schema.incentivePayments.id, existing.id)).run();

  writeAuditLog({
    category: "incentive",
    action: "incentive_marked_unpaid",
    actorUserId: byUserId,
    targetUserId: userId,
    entityType: "incentive_payment",
    entityId: existing.id,
    summary: `Reversed ${getUserName(userId) ?? `User #${userId}`}'s ${month} incentive back to pending (was ₹${previous.amount.toLocaleString("en-IN")}).`,
    details: { month, previous },
  });

  return { ok: true, previous };
}

// ---------------------------------------------------------------------------
// Per-booking ledger
// ---------------------------------------------------------------------------

/**
 * One row per person per confirmed booking.
 *
 * A booking earns two of these - one for the assigned Caller, one for the
 * assigned SM - because a lead can have both and each is paid and tracked on
 * its own. Splitting by person (rather than one row per lead holding both
 * amounts) is what makes it possible to tick off the Caller's half while the
 * SM's is still owed.
 */
export type BookingIncentiveRow = {
  /** Stable identity: the booking, the person, and which side they are on. */
  key: string;
  bookingId: number;
  leadId: number;
  leadName: string;
  projectId: string;
  projectTitle: string;
  role: "sales_manager" | "caller";
  userId: number;
  userName: string;
  /** Rate for this person's month total, so every row they own shows the same figure. */
  amount: number;
  month: string;
  bookedAt: string;
  unit: string | null;
  paid: boolean;
  paidAt: string | null;
  paidByName: string | null;
};

export type BookingIncentiveFilters = {
  month?: string;
  userId?: number;
  role?: "sales_manager" | "caller";
  paid?: boolean;
};

/**
 * The confirmed bookings a per-booking row can exist for.
 *
 * Deliberately the bookings module only, and not the legacy "lead status is
 * booked" fallback that `confirmedBookingsForMonth` also accepts: a fallback has
 * no booking id, no project and no confirm event, so there is nothing to point a
 * payment at and nothing for staff to recognise. Leads booked that way still
 * count toward the monthly ladder total used by salary and attendance reports -
 * the two are different views and do not agree row-for-row by design.
 */
function confirmedBookingRecords() {
  const db = getDb();

  const bookings = db
    .select({
      id: schema.bookings.id,
      leadId: schema.bookings.leadId,
      smId: schema.bookings.smId,
      projectId: schema.bookings.projectId,
      unit: schema.bookings.unit,
      bookingDate: schema.bookings.bookingDate,
    })
    .from(schema.bookings)
    .where(eq(schema.bookings.status, "confirmed"))
    .all();

  const leads = new Map(
    db
      .select({
        id: schema.leads.id,
        name: schema.leads.name,
        assignedCallerId: schema.leads.assignedCallerId,
        assignedSmId: schema.leads.assignedSmId,
      })
      .from(schema.leads)
      .all()
      .map((l) => [l.id, l])
  );

  const users = new Map(
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).all().map((u) => [u.id, u])
  );

  return bookings
    .map((b) => {
      const lead = leads.get(b.leadId);
      return {
        ...b,
        month: istMonthKey(b.bookingDate),
        leadName: lead?.name || `Lead #${b.leadId}`,
        // The booking's own project wins; fall back to the lead's assignment
        // when a booking was recorded without one.
        projectId: b.projectId || "",
        callerId: lead?.assignedCallerId ?? null,
        smId: b.smId ?? lead?.assignedSmId ?? null,
        users,
      };
    })
    .filter((b) => b.smId != null || b.callerId != null);
}

export function getBookingIncentiveRows(filters: BookingIncentiveFilters = {}): BookingIncentiveRow[] {
  const db = getDb();
  const records = confirmedBookingRecords();
  const ladders = getIncentiveLadders();

  // How many bookings each person earned this month, across all months' records
  // restricted to the one being viewed. The ladder rate is per month, so the
  // count has to be month-scoped before a rate is read off it.
  const countByUser = new Map<string, number>();
  for (const rec of records) {
    if (filters.month && rec.month !== filters.month) continue;
    for (const [side, uid] of [["caller", rec.callerId], ["sm", rec.smId]] as const) {
      if (uid == null) continue;
      const k = `${rec.month}:${side}:${uid}`;
      countByUser.set(k, (countByUser.get(k) ?? 0) + 1);
    }
  }

  const payments = db.select().from(schema.incentivePayments).all();
  const paidByBooking = new Map(
    payments
      .filter((p) => p.bookingId != null)
      .map((p) => [`${p.bookingId}:${p.userId}:${p.role}`, p] as const)
  );

  const rows: BookingIncentiveRow[] = [];

  for (const rec of records) {
    if (filters.month && rec.month !== filters.month) continue;

    const sides: Array<{ role: "caller" | "sales_manager"; uid: number | null }> = [
      { role: "caller", uid: rec.callerId },
      { role: "sales_manager", uid: rec.smId },
    ];

    for (const { role, uid } of sides) {
      if (uid == null) continue;
      if (filters.userId != null && filters.userId !== uid) continue;
      if (filters.role && filters.role !== role) continue;

      const ladderKey = role === "caller" ? "caller" : "sm";
      const count = countByUser.get(`${rec.month}:${ladderKey}:${uid}`) ?? 1;
      const rate = rateForCount(ladders[ladderKey], count);

      const payment = paidByBooking.get(`${rec.id}:${uid}:${role}`);
      const paid = !!payment;

      if (filters.paid != null && paid !== filters.paid) continue;

      rows.push({
        key: `${rec.id}:${uid}:${role}`,
        bookingId: rec.id,
        leadId: rec.leadId,
        leadName: rec.leadName,
        projectId: rec.projectId,
        projectTitle: projectTitleFor(rec.projectId),
        role,
        userId: uid,
        userName: rec.users.get(uid)?.name || `User #${uid}`,
        amount: rate,
        month: rec.month,
        bookedAt: rec.bookingDate,
        unit: rec.unit,
        paid,
        paidAt: payment?.paidAt || null,
        paidByName: payment?.paidBy != null ? rec.users.get(payment.paidBy)?.name ?? null : null,
      });
    }
  }

  return rows.sort((a, b) => (a.bookedAt < b.bookedAt ? 1 : a.bookedAt > b.bookedAt ? -1 : a.userName.localeCompare(b.userName)));
}

function projectTitleFor(slug: string): string {
  if (!slug) return "";
  return getProject(slug)?.title || slug;
}

/** Sum of every unpaid amount - what the company currently owes. */
export function getUnpaidIncentiveLiability(filters: Omit<BookingIncentiveFilters, "paid"> = {}): number {
  return getBookingIncentiveRows({ ...filters, paid: false }).reduce((sum, r) => sum + r.amount, 0);
}

export type IncentiveLiability = {
  unpaidTotal: number;
  unpaidRows: number;
  paidTotal: number;
  paidRows: number;
};

export function getIncentiveLiabilitySummary(filters: Omit<BookingIncentiveFilters, "paid"> = {}): IncentiveLiability {
  const rows = getBookingIncentiveRows(filters);
  const unpaid = rows.filter((r) => !r.paid);
  const paid = rows.filter((r) => r.paid);
  return {
    unpaidTotal: unpaid.reduce((s, r) => s + r.amount, 0),
    unpaidRows: unpaid.length,
    paidTotal: paid.reduce((s, r) => s + r.amount, 0),
    paidRows: paid.length,
  };
}

/**
 * Settle one person's half of one booking. `bookingId` and `userId` together
 * identify the row, so a lead with both a Caller and an SM can have one side
 * paid while the other is still owed.
 */
export function markBookingIncentivePaid(
  bookingId: number,
  userId: number,
  role: string,
  amount: number,
  byUserId: number
): { amount: number; paidAt: string } {
  const db = getDb();
  const paidAt = new Date().toISOString();

  const existing = db
    .select()
    .from(schema.incentivePayments)
    .where(
      and(
        eq(schema.incentivePayments.bookingId, bookingId),
        eq(schema.incentivePayments.userId, userId),
        eq(schema.incentivePayments.role, role)
      )
    )
    .get();

  if (existing) {
    db.update(schema.incentivePayments)
      .set({ amount, paidAt, paidBy: byUserId })
      .where(eq(schema.incentivePayments.id, existing.id))
      .run();
  } else {
    db.insert(schema.incentivePayments)
      .values({
        userId,
        month: istMonthKey(paidAt),
        role,
        amount,
        bookingId,
        paidBy: byUserId,
        paidAt,
        createdAt: paidAt,
      })
      .run();
  }

  const row = getBookingIncentiveRows({}).find((r) => r.bookingId === bookingId && r.userId === userId && r.role === role);

  writeAuditLog({
    category: "incentive",
    action: existing ? "incentive_paid_updated" : "incentive_marked_paid",
    actorUserId: byUserId,
    targetUserId: userId,
    entityType: "incentive_payment",
    entityId: existing?.id ?? `${bookingId}:${userId}:${role}`,
    summary: `${getUserName(userId) ?? `User #${userId}`} marked paid ${formatRs(amount)} for booking #${bookingId}${row ? ` (${row.leadName})` : ""}.`,
    details: { bookingId, userId, role, amount, lead: row?.leadName ?? null },
  });

  return { amount, paidAt };
}

export function markBookingIncentiveUnpaid(
  bookingId: number,
  userId: number,
  role: string,
  byUserId: number
): { ok: boolean; previous: { amount: number; paidAt: string | null } | null } {
  const db = getDb();
  const existing = db
    .select()
    .from(schema.incentivePayments)
    .where(
      and(
        eq(schema.incentivePayments.bookingId, bookingId),
        eq(schema.incentivePayments.userId, userId),
        eq(schema.incentivePayments.role, role)
      )
    )
    .get();

  if (!existing) return { ok: false, previous: null };

  const previous = { amount: existing.amount, paidAt: existing.paidAt || null };
  db.delete(schema.incentivePayments).where(eq(schema.incentivePayments.id, existing.id)).run();

  writeAuditLog({
    category: "incentive",
    action: "incentive_marked_unpaid",
    actorUserId: byUserId,
    targetUserId: userId,
    entityType: "incentive_payment",
    entityId: existing.id,
    summary: `Reversed ${getUserName(userId) ?? `User #${userId}`}'s ${formatRs(previous.amount)} for booking #${bookingId} back to unpaid.`,
    details: { bookingId, userId, role, previous },
  });

  return { ok: true, previous };
}

/** Distinct people appearing in the ledger, for the filter dropdowns. */
export function getIncentiveParticipants(filters: Omit<BookingIncentiveFilters, "userId" | "role"> = {}) {
  const seen = new Map<string, { userId: number; name: string; role: string }>();
  for (const r of getBookingIncentiveRows(filters)) {
    seen.set(`${r.userId}:${r.role}`, { userId: r.userId, name: r.userName, role: r.role });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}