import { getDb } from "./db";
import { crmSettings } from "./schema";
import { eq } from "drizzle-orm";

const DEFAULTS: Record<string, string> = {
  sla_first_response_min: "5",
  budget_ranges: '["under_25","25_40","40_60","60_85","85_plus"]',
  matching_weights: '{"subLocation":40,"location":20,"budget":25,"budgetPartial":10}',
  no_response_schedule: '{"1":0,"2":240,"3":1440,"4":4320,"5":10080}',
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