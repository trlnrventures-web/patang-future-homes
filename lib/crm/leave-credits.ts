import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./schema";
import { istToday } from "./attendance";

/**
 * Banked leave credits.
 *
 * Working your week-off banks one credit (see `week_off_decisions`), and a
 * credit is only good for two months. Nothing in the CRM previously expired
 * them, so a credit earned a year ago was as spendable as one earned last week.
 *
 * A credit is not a row of its own: it *is* the `week_off_decisions` row with
 * `leave_banked = 1`, whose `date` is the earned date. Modelling it as a copy
 * would mean two tables holding the same fact and no way to tell which is
 * right. Only the spending half needs storage, in `leave_credit_usages`.
 */

export const CREDIT_VALIDITY_MONTHS = 2;

/** A credit inside this window is surfaced as "expiring" on the balance card. */
export const EXPIRING_SOON_DAYS = 30;

export type CreditStatus = "available" | "used" | "expired";

export type LeaveCredit = {
  creditId: number;
  earnedDate: string;
  expiresOn: string;
  status: CreditStatus;
  usedOn: string | null;
  daysToExpiry: number;
};

export type LeaveBalance = {
  /** Credits earned, not yet spent and not yet expired. */
  available: number;
  /** Every credit ever earned, spent or not. */
  earned: number;
  spent: number;
  expired: number;
  credits: LeaveCredit[];
  /** The soonest expiry among available credits, if any is close. */
  nextExpiry: { expiresOn: string; daysLeft: number } | null;
};

/**
 * Add calendar months to a YYYY-MM-DD key, clamping to the last day of the
 * target month. The day is clamped rather than rolled forward on purpose:
 * a credit earned on 31 Jan expires 31 Mar, not 2/3 Mar, and rolling forward
 * would push a late-January credit's whole life into April.
 */
export function addMonthsToDateKey(dateKey: string, months: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const targetMonthIndex = m - 1 + months;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysBetween(fromKey: string, toKey: string): number {
  const a = Date.parse(`${fromKey}T00:00:00Z`);
  const b = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/**
 * A credit is usable through the last day of its expiry month: the expiry date
 * itself is still good, so someone told "expires 15 Nov" can still book 15 Nov.
 */
export function isCreditExpired(expiresOn: string, today = istToday()): boolean {
  return expiresOn < today;
}

/**
 * Every credit a staff member has earned, oldest first, annotated with whether
 * it is still usable.
 */
export function getLeaveCredits(userId: number, today = istToday()): LeaveCredit[] {
  const db = getDb();

  const earned = db
    .select({
      id: schema.weekOffDecisions.id,
      date: schema.weekOffDecisions.date,
    })
    .from(schema.weekOffDecisions)
    .where(
      and(
        eq(schema.weekOffDecisions.userId, userId),
        eq(schema.weekOffDecisions.leaveBanked, true)
      )
    )
    .all();

  if (earned.length === 0) return [];

  const spentByCredit = new Map(
    db
      .select({
        creditId: schema.leaveCreditUsages.creditId,
        usedOn: schema.leaveCreditUsages.usedOn,
      })
      .from(schema.leaveCreditUsages)
      .where(
        inArray(
          schema.leaveCreditUsages.creditId,
          earned.map((e) => e.id)
        )
      )
      .all()
      .map((u) => [u.creditId, u.usedOn] as const)
  );

  return earned
    .map((e) => {
      const expiresOn = addMonthsToDateKey(e.date, CREDIT_VALIDITY_MONTHS);
      const usedOn = spentByCredit.get(e.id) ?? null;
      const expired = isCreditExpired(expiresOn, today);
      return {
        creditId: e.id,
        earnedDate: e.date,
        expiresOn,
        usedOn,
        status: (usedOn ? "used" : expired ? "expired" : "available") as CreditStatus,
        daysToExpiry: daysBetween(today, expiresOn),
      };
    })
    // Soonest expiry first, so the balance card can read the top row as
    // "the one you are about to lose" without re-sorting.
    .sort((a, b) => (a.expiresOn < b.expiresOn ? -1 : a.expiresOn > b.expiresOn ? 1 : 0));
}

export function getLeaveBalance(userId: number, today = istToday()): LeaveBalance {
  const credits = getLeaveCredits(userId, today);
  const available = credits.filter((c) => c.status === "available");
  const nextExpSoon = available.find((c) => c.daysToExpiry <= EXPIRING_SOON_DAYS) ?? null;

  return {
    available: available.length,
    earned: credits.length,
    spent: credits.filter((c) => c.status === "used").length,
    expired: credits.filter((c) => c.status === "expired").length,
    credits,
    nextExpiry: nextExpSoon ? { expiresOn: nextExpSoon.expiresOn, daysLeft: nextExpSoon.daysToExpiry } : null,
  };
}

/** "15 Nov 2026", for the balance card. */
export function formatCreditDate(dateKey: string): string {
  try {
    return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return dateKey;
  }
}

/**
 * Human summary for the balance card. Names the count and, when something is
 * about to lapse, the exact date - the whole point being that nobody should
 * discover a vanished credit by trying to book with it.
 */
export function describeBalance(balance: LeaveBalance): string {
  if (balance.earned === 0) {
    return "No credits banked yet. Work your week-off to bank one.";
  }
  if (balance.available === 0) {
    const lapsed = balance.expired > 0 ? `, ${balance.expired} expired` : "";
    return `0 credits available (${balance.spent} used${lapsed}).`;
  }
  const base = `${balance.available} credit${balance.available === 1 ? "" : "s"} available`;
  if (!balance.nextExpiry) return `${base}.`;
  const { expiresOn, daysLeft } = balance.nextExpiry;
  const when =
    daysLeft <= 0
      ? "today"
      : daysLeft === 1
        ? "tomorrow"
        : `in ${daysLeft} days`;
  return `${base}, 1 expiring on ${formatCreditDate(expiresOn)} (${when}).`;
}

/**
 * Spend banked credits against a set of leave days, oldest expiry first.
 *
 * Approval is the only moment a credit can be spent, and it is spent here so
 * the balance a staff member sees can never overstate what is left. Credits
 * already past their expiry date are skipped rather than spent, and any day
 * beyond the last usable credit is left uncovered instead of borrowing from a
 * credit that does not exist.
 *
 * Returns the dates that were actually covered so the caller can tell the
 * requester how much of their leave the bank paid for.
 */
export function consumeCreditsForLeave(
  userId: number,
  dates: string[],
  leaveRequestId: number | null = null,
  today = istToday()
): string[] {
  const usable = getLeaveCredits(userId, today)
    .filter((c) => c.status === "available")
    .sort((a, b) => (a.expiresOn < b.expiresOn ? -1 : 1));

  if (usable.length === 0 || dates.length === 0) return [];

  const db = getDb();
  const covered: string[] = [];
  const spent = new Set<number>();

  for (const date of [...dates].sort()) {
    // Oldest expiry first, so a credit that is about to lapse is spent before
    // a younger one that still has time in hand.
    const credit = usable.find((c) => !spent.has(c.creditId) && c.earnedDate <= date);
    if (!credit) continue;
    db.insert(schema.leaveCreditUsages)
      .values({
        userId,
        creditId: credit.creditId,
        usedOn: date,
        leaveRequestId,
        createdAt: new Date().toISOString(),
      })
      .run();
    spent.add(credit.creditId);
    covered.push(date);
  }

  return covered;
}

/**
 * Return credits to the bank when an approved leave is cancelled or rejected, so
 * a withdrawn request does not silently cost the requester a credit.
 */
export function releaseCreditsForLeave(leaveRequestId: number) {
  const db = getDb();
  db.delete(schema.leaveCreditUsages).where(eq(schema.leaveCreditUsages.leaveRequestId, leaveRequestId)).run();
}

/** Per-staff rollup for the admin view. */
export type StaffCreditSummary = {
  userId: number;
  name: string;
  role: string;
  available: number;
  spent: number;
  expired: number;
  nextExpiry: string | null;
};

export function getAllStaffCreditBalances(today = istToday()): StaffCreditSummary[] {
  const db = getDb();
  const users = db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      role: schema.users.role,
    })
    .from(schema.users)
    .where(eq(schema.users.active, true))
    .all();

  return users
    .map((u) => {
      const b = getLeaveBalance(u.id, today);
      return {
        userId: u.id,
        name: u.name,
        role: u.role,
        available: b.available,
        spent: b.spent,
        expired: b.expired,
        nextExpiry: b.nextExpiry?.expiresOn ?? null,
      };
    })
    .filter((u) => u.available > 0 || u.spent > 0 || u.expired > 0)
    .sort((a, b) => b.available - a.available || a.name.localeCompare(b.name));
}

/** Full per-credit ledger for one staff member, for the admin drill-down. */
export function getStaffCreditLedger(userId: number, today = istToday()): LeaveCredit[] {
  return getLeaveCredits(userId, today).sort((a, b) => (a.earnedDate < b.earnedDate ? 1 : -1));
}
