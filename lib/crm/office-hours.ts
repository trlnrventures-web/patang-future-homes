/**
 * Office-hours contact masking.
 *
 * Outside configured office hours, lead contact details are masked for staff
 * (caller / sales_manager) and never for admin or sales_head. Masking is
 * applied in the API, not the UI, so the real number is not present in any
 * response, page source, or client bundle.
 *
 * Office hours live in `crm_settings` under `office_hours` as JSON and are
 * editable by admin/sales_head on the Settings > Office Hours page.
 */

import { getSetting } from "./settings";
import { getDb } from "./db";
import * as schema from "./schema";
import { and, eq } from "drizzle-orm";
import { istToday } from "./attendance";

export type OfficeHours = {
  /** 0 = Sunday ... 6 = Saturday. */
  days: number[];
  /** Minutes from midnight IST. */
  startMin: number;
  endMin: number;
  enabled: boolean;
  /** IANA zone; the CRM is India-only today, so this is fixed at IST. */
  timezone: string;
  /**
   * The office-wide week-off day. Contacts stay masked for the whole day
   * regardless of the working window, unless the person is checked in. This is
   * a single office rule and is deliberately not the per-user `week_off_day`,
   * which is one person's roster arrangement.
   */
  weekOffDay: string;
};

export const OFFICE_WEEK_OFF_DAY = "Tuesday";

const WEEK_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function isWeekOffDayName(name: string | null | undefined): boolean {
  return WEEK_DAY_NAMES.includes((name || "") as (typeof WEEK_DAY_NAMES)[number]);
}

export const DEFAULT_OFFICE_HOURS: OfficeHours = {
  // Mon/Wed-Sun. Tuesday is the week off, so it is absent from the working
  // days and handled by the separate week-off rule below.
  days: [0, 1, 3, 4, 5, 6],
  startMin: 10 * 60 + 30, // 10:30
  endMin: 19 * 60 + 30, // 19:30
  enabled: true,
  timezone: "Asia/Kolkata",
  weekOffDay: OFFICE_WEEK_OFF_DAY,
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayLabel(d: number): string {
  return DAY_LABELS[d] ?? String(d);
}

export function parseOfficeHours(raw: string | null | undefined): OfficeHours {
  if (!raw) return DEFAULT_OFFICE_HOURS;
  try {
    const p = JSON.parse(raw) as Partial<OfficeHours>;
    const days = Array.isArray(p.days)
      ? p.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : DEFAULT_OFFICE_HOURS.days;
    return {
      days: days.length ? days : DEFAULT_OFFICE_HOURS.days,
      startMin:
        Number.isInteger(p.startMin) && p.startMin! >= 0 && p.startMin! <= 24 * 60
          ? p.startMin!
          : DEFAULT_OFFICE_HOURS.startMin,
      endMin:
        Number.isInteger(p.endMin) && p.endMin! >= 0 && p.endMin! <= 24 * 60
          ? p.endMin!
          : DEFAULT_OFFICE_HOURS.endMin,
      enabled: p.enabled !== false,
      timezone: p.timezone || DEFAULT_OFFICE_HOURS.timezone,
      weekOffDay: isWeekOffDayName(p.weekOffDay) ? p.weekOffDay! : DEFAULT_OFFICE_HOURS.weekOffDay,
    };
  } catch {
    return DEFAULT_OFFICE_HOURS;
  }
}

export function getOfficeHours(): OfficeHours {
  return parseOfficeHours(getSetting("office_hours"));
}

export function serializeOfficeHours(h: OfficeHours): string {
  return JSON.stringify({
    days: [...h.days].sort((a, b) => a - b),
    startMin: h.startMin,
    endMin: h.endMin,
    enabled: h.enabled,
    timezone: DEFAULT_OFFICE_HOURS.timezone,
    weekOffDay: h.weekOffDay,
  });
}

/** Roles that never see masked contact details, at any hour. */
const UNMASKED_ROLES = new Set(["admin", "sales_head"]);

export function canAlwaysSeeContacts(role: string | undefined | null): boolean {
  return !!role && UNMASKED_ROLES.has(role);
}

/**
 * Whether the given wall-clock time in the office timezone falls inside the
 * configured working window. An overnight window (e.g. 22:00-06:00) is
 * supported: when end <= start the day is treated as wrapping past midnight.
 */
export function isWithinOfficeHours(h: OfficeHours, now: Date): boolean {
  if (!h.enabled) return true;

  // Read the wall clock in the office timezone rather than the server's zone.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: h.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wdMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dow = wdMap[get("weekday")] ?? now.getUTCDay();
  const hh = Number(get("hour")) % 24;
  const mm = Number(get("minute"));
  const minOfDay = hh * 60 + mm;

  const wraps = h.endMin <= h.startMin;

  if (wraps) {
    // Working window belongs partly to the previous calendar day.
    const prevDow = (dow + 6) % 7;
    if (h.days.includes(prevDow) && minOfDay >= h.startMin) return true;
    if (h.days.includes(dow) && minOfDay < h.endMin) return true;
    return false;
  }

  return h.days.includes(dow) && minOfDay >= h.startMin && minOfDay < h.endMin;
}

export type MaskReason = "always_visible" | "week_off" | "within_hours" | "outside_hours" | "disabled";

export type MaskDecision = {
  mask: boolean;
  hours: OfficeHours;
  withinHours: boolean;
  /** Why this decision came out the way it did, for the banner. */
  reason: MaskReason;
  /** True when the person is on the office week-off but checked in and working. */
  weekOffWorkedIn: boolean;
};

/** The person whose contacts are being decided, as far as masking cares. */
export type MaskSubject = {
  id: number;
  role?: string | null;
} | null;

/**
 * Has this person actually checked in today? On the week-off a person who chose
 * to work is genuinely on the floor, so their contacts stay visible - the
 * alternative is that opting to cover the office costs you the ability to do
 * the job. Read from the attendance row rather than the week-off decision so a
 * decision of "I'm working" with no check-in does not unlock anything.
 */
export function isCheckedInToday(userId: number, today = istToday()): boolean {
  const db = getDb();
  const row = db
    .select({ id: schema.attendance.id })
    .from(schema.attendance)
    .where(and(eq(schema.attendance.userId, userId), eq(schema.attendance.date, today)))
    .get();
  return !!row;
}

/** Weekday number (0 = Sunday) for an instant, in the office timezone. */
function weekdayInZone(now: Date, timezone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(now);
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return wdMap[name] ?? now.getUTCDay();
}

export function isWeekOffToday(h: OfficeHours, now = new Date()): boolean {
  return WEEK_DAY_NAMES[weekdayInZone(now, h.timezone)] === h.weekOffDay;
}

/**
 * Single decision point used by every lead-returning API. Admin and sales_head
 * always get the unmasked value; masking is off entirely when the feature is
 * disabled in settings.
 */
export function contactMaskFor(subject: MaskSubject, now = new Date()): MaskDecision {
  const hours = getOfficeHours();
  const withinHours = isWithinOfficeHours(hours, now);
  const role = subject?.role;

  if (canAlwaysSeeContacts(role)) {
    return { mask: false, hours, withinHours, reason: "always_visible", weekOffWorkedIn: false };
  }

  if (!hours.enabled) {
    return { mask: false, hours, withinHours, reason: "disabled", weekOffWorkedIn: false };
  }

  if (isWeekOffToday(hours, now)) {
    const worked = subject ? isCheckedInToday(subject.id, istToday()) : false;
    if (!worked) {
      return { mask: true, hours, withinHours, reason: "week_off", weekOffWorkedIn: false };
    }
    return { mask: false, hours, withinHours, reason: "within_hours", weekOffWorkedIn: true };
  }

  return {
    mask: !withinHours,
    hours,
    withinHours,
    reason: withinHours ? "within_hours" : "outside_hours",
    weekOffWorkedIn: false,
  };
}

/**
 * "98XX XXXXX72" - the first two and last two digits survive so a user can still
 * recognise a number from their own contact list, and the middle is hidden.
 * Values too short to mask safely are hidden entirely.
 *
 * Stored numbers are `+91XXXXXXXXXX`, so the 91 country-code prefix is stripped
 * first. Without that, every masked number in the CRM read "91XX XXXXX22" - the
 * country code was standing in for the subscriber's first two digits, which are
 * the two digits a caller actually recognises their own contact by.
 */
export function maskPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length < 6) return "X".repeat(Math.max(digits.length, 4));
  return `${digits.slice(0, 2)}XX XXXXX${digits.slice(-2)}`;
}

/** Emails keep the first character and the full domain. */
export function maskEmail(raw: string | null | undefined): string {
  if (!raw) return "";
  const at = String(raw).indexOf("@");
  if (at < 1) return "X".repeat(Math.max(String(raw).length, 4));
  const local = String(raw).slice(0, at);
  const domain = String(raw).slice(at);
  const head = local.slice(0, 1);
  const hidden = Math.max(local.length - 1, 3);
  return `${head}${"X".repeat(hidden)}${domain}`;
}

/**
 * Applied to one lead row on the way out of an API. `phone`/`secondaryPhone`/
 * `whatsappNumber`/`email` become the masked string, and `contactHidden` tells the UI to
 * disable Call/WhatsApp tap-to-dial for this row.
 */
export function maskLeadContacts<T extends {
  phone?: string | null;
  secondaryPhone?: string | null;
  whatsappNumber?: string | null;
  email?: string | null;
}>(lead: T, decision: MaskDecision): T & { contactHidden: boolean } {
  if (!decision.mask) return { ...lead, contactHidden: false };
  return {
    ...lead,
    phone: maskPhone(lead.phone),
    secondaryPhone: maskPhone(lead.secondaryPhone),
    whatsappNumber: maskPhone(lead.whatsappNumber),
    email: maskEmail(lead.email),
    contactHidden: true,
  };
}

/** Bulk form for list endpoints. */
export function maskLeadList<T extends {
  phone?: string | null;
  secondaryPhone?: string | null;
  whatsappNumber?: string | null;
  email?: string | null;
}>(leads: T[], decision: MaskDecision): (T & { contactHidden: boolean })[] {
  if (!decision.mask) return leads.map((l) => ({ ...l, contactHidden: false }));
  return leads.map((l) => maskLeadContacts(l, decision));
}

/** Human summary for the "contact details hidden" banner. */
export function describeMasking(decision: MaskDecision): string | null {
  if (!decision.mask) return null;
  const { startMin, endMin, weekOffDay } = decision.hours;
  const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  if (decision.reason === "week_off") {
    return `${weekOffDay} is the office week-off. Contact details stay hidden all day unless you check in and work it.`;
  }
  const days = decision.hours.days.map(dayLabel).join(", ");
  return `Contact details hidden outside office hours (${days}, ${fmt(startMin)}-${fmt(endMin)} IST).`;
}
