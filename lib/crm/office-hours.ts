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

export type OfficeHours = {
  /** 0 = Sunday ... 6 = Saturday. */
  days: number[];
  /** Minutes from midnight IST. */
  startMin: number;
  endMin: number;
  enabled: boolean;
  /** IANA zone; the CRM is India-only today, so this is fixed at IST. */
  timezone: string;
};

export const DEFAULT_OFFICE_HOURS: OfficeHours = {
  days: [1, 2, 3, 4, 5, 6], // Mon-Sat
  startMin: 10 * 60, // 10:00
  endMin: 19 * 60, // 19:00
  enabled: true,
  timezone: "Asia/Kolkata",
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

export type MaskDecision = {
  mask: boolean;
  hours: OfficeHours;
  withinHours: boolean;
};

/**
 * Single decision point used by every lead-returning API. Admin and sales_head
 * always get the unmasked value; masking is off entirely when the feature is
 * disabled in settings.
 */
export function contactMaskFor(role: string | undefined | null, now = new Date()): MaskDecision {
  const hours = getOfficeHours();
  const withinHours = isWithinOfficeHours(hours, now);
  if (canAlwaysSeeContacts(role)) {
    return { mask: false, hours, withinHours };
  }
  return { mask: !withinHours, hours, withinHours };
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
 * Applied to one lead row on the way out of an API. `phone`/`whatsappNumber`/
 * `email` become the masked string, and `contactHidden` tells the UI to
 * disable Call/WhatsApp tap-to-dial for this row.
 */
export function maskLeadContacts<T extends {
  phone?: string | null;
  whatsappNumber?: string | null;
  email?: string | null;
}>(lead: T, decision: MaskDecision): T & { contactHidden: boolean } {
  if (!decision.mask) return { ...lead, contactHidden: false };
  return {
    ...lead,
    phone: maskPhone(lead.phone),
    whatsappNumber: maskPhone(lead.whatsappNumber),
    email: maskEmail(lead.email),
    contactHidden: true,
  };
}

/** Bulk form for list endpoints. */
export function maskLeadList<T extends {
  phone?: string | null;
  whatsappNumber?: string | null;
  email?: string | null;
}>(leads: T[], decision: MaskDecision): (T & { contactHidden: boolean })[] {
  if (!decision.mask) return leads.map((l) => ({ ...l, contactHidden: false }));
  return leads.map((l) => maskLeadContacts(l, decision));
}

/** Human summary for the "contact details hidden" banner. */
export function describeMasking(decision: MaskDecision): string | null {
  if (!decision.mask) return null;
  const { startMin, endMin } = decision.hours;
  const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const days = decision.hours.days.map(dayLabel).join(", ");
  return `Contact details hidden outside office hours (${days}, ${fmt(startMin)}-${fmt(endMin)} IST).`;
}
