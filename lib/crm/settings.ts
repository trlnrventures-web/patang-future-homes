import { getDb } from "./db";
import { crmSettings } from "./schema";
import { eq } from "drizzle-orm";
import { parseBudgetRanges, type BudgetPreset } from "./budget";

const DEFAULTS: Record<string, string> = {
  sla_first_response_min: "5",
  budget_ranges: '["under_25","25_40","40_60","60_85","85_plus"]',
  matching_weights: '{"subLocation":40,"location":20,"budget":25,"budgetPartial":10}',
  no_response_schedule: '{"1":0,"2":240,"3":1440,"4":4320,"5":10080}',
  // ---- Vasai West conversion strategy ----
  budget_stretch_pct: "10",
  daily_visit_cap: "3",
  nurture_daily_task_limit: "20",
  post_visit_cadence: "[2,5,10,20]",
  routing_pointer_commission: "",
  routing_pointer_salaried: "",
  assignment_pointer_sm: "",
  visit_reminder_hour_ist: "10",
  visit_reminder_overdue_hour_ist: "18",
};

export type MatchingWeights = {
  subLocation: number;
  location: number;
  budget: number;
  budgetPartial: number;
};

export function getSetting(key: string): string {
  const db = getDb();
  const row = db.select().from(crmSettings).where(eq(crmSettings.key, key)).get();
  return row?.value ?? DEFAULTS[key] ?? "";
}

export function getSlaFirstResponseMin(): number {
  const v = parseInt(getSetting("sla_first_response_min"), 10);
  return Number.isFinite(v) && v > 0 ? v : 5;
}

/** The admin-configured budget chips shown on the lead editor. */
export function getBudgetPresets(): BudgetPreset[] {
  return parseBudgetRanges(getSetting("budget_ranges"));
}

export function getMatchingWeights(): MatchingWeights {
  const parsed = JSON.parse(getSetting("matching_weights") || "{}") as Partial<MatchingWeights>;
  return {
    subLocation: typeof parsed.subLocation === "number" ? parsed.subLocation : 40,
    location: typeof parsed.location === "number" ? parsed.location : 20,
    budget: typeof parsed.budget === "number" ? parsed.budget : 25,
    budgetPartial: typeof parsed.budgetPartial === "number" ? parsed.budgetPartial : 10,
  };
}

export type NoResponseSchedule = Record<number, number>;

export function getNoResponseSchedule(): NoResponseSchedule {
  try {
    return JSON.parse(getSetting("no_response_schedule") || "{}") as NoResponseSchedule;
  } catch {
    return { 1: 0, 2: 240, 3: 1440, 4: 4320, 5: 10080 };
  }
}

export function updateSetting(key: string, value: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.select().from(crmSettings).where(eq(crmSettings.key, key)).get();
  if (existing) {
    db.update(crmSettings).set({ value, updatedAt: now }).where(eq(crmSettings.key, key)).run();
  } else {
    db.insert(crmSettings).values({ key, value, updatedAt: now }).run();
  }
}

/** Percent below the lowest matching unit price that still counts as a stretch. */
export function getBudgetStretchPct(): number {
  const v = parseFloat(getSetting("budget_stretch_pct"));
  return Number.isFinite(v) && v >= 0 && v <= 50 ? v : 10;
}

export function getDailyVisitCap(): number {
  const v = parseInt(getSetting("daily_visit_cap"), 10);
  return Number.isFinite(v) && v > 0 ? v : 3;
}

export function getNurtureDailyTaskLimit(): number {
  const v = parseInt(getSetting("nurture_daily_task_limit"), 10);
  return Number.isFinite(v) && v > 0 ? v : 20;
}

export function getPostVisitCadenceDays(): number[] {
  try {
    const parsed = JSON.parse(getSetting("post_visit_cadence"));
    if (Array.isArray(parsed)) {
      const days = parsed.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
      if (days.length) return days;
    }
  } catch {
    // fall through
  }
  return [2, 5, 10, 20];
}

export function getRoutingPointer(tier: "commission" | "salaried"): number | null {
  const raw = getSetting(`routing_pointer_${tier}`);
  const v = parseInt(raw, 10);
  return Number.isFinite(v) ? v : null;
}

export function setRoutingPointer(tier: "commission" | "salaried", userId: number): void {
  updateSetting(`routing_pointer_${tier}`, String(userId));
}

export function getAssignmentPointerSm(): number | null {
  const raw = getSetting("assignment_pointer_sm");
  const v = parseInt(raw, 10);
  return Number.isFinite(v) ? v : null;
}

export function setAssignmentPointerSm(userId: number): void {
  updateSetting("assignment_pointer_sm", String(userId));
}

export function getVisitReminderHourIst(): number {
  const v = parseInt(getSetting("visit_reminder_hour_ist"), 10);
  return Number.isFinite(v) && v >= 0 && v <= 23 ? v : 10;
}

export function getVisitReminderOverdueHourIst(): number {
  const v = parseInt(getSetting("visit_reminder_overdue_hour_ist"), 10);
  return Number.isFinite(v) && v >= 0 && v <= 23 ? v : 18;
}