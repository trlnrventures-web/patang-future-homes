import { projects } from "@/lib/projects";
import { configBudgetRange, desiredArea, projectBhkOptions } from "./matching";

/**
 * The Vasai West qualification engine.
 *
 * Three hard gates decide whether a lead can ever become A or B:
 *   1. location accepts Vasai West
 *   2. the requested BHK exists in an active project
 *   3. the budget reaches the lowest matching unit price, with a configurable
 *      stretch (default 10% below)
 *
 * A lead that clears all three is graded on timeline, visit intent and whether
 * the budget needed the stretch. Anything that fails a gate, refuses a visit,
 * cannot be reached, or stays undecided after two re-asks is C.
 */

export type LeadGrade = "A" | "B" | "C";

export type VisitIntent = "not_asked" | "yes" | "maybe" | "no";

export type FundingStatus = "self_funded" | "loan" | "not_sure";

export type VisitAttendees = "self" | "spouse" | "family_together";

export type NurtureReason =
  | "budget_low"
  | "location"
  | "configuration"
  | "exploring"
  | "not_interested"
  | "not_reachable"
  | "other";

export const VISIT_INTENT_OPTIONS: { value: VisitIntent; label: string }[] = [
  { value: "not_asked", label: "Not asked yet" },
  { value: "yes", label: "Yes — will give a day" },
  { value: "maybe", label: "Maybe — checking with family" },
  { value: "no", label: "No — details on WhatsApp" },
];

export const FUNDING_OPTIONS: { value: FundingStatus; label: string }[] = [
  { value: "self_funded", label: "Self-funded" },
  { value: "loan", label: "Loan" },
  { value: "not_sure", label: "Not sure" },
];

export const ATTENDEE_OPTIONS: { value: VisitAttendees; label: string }[] = [
  { value: "self", label: "Self" },
  { value: "spouse", label: "Spouse" },
  { value: "family_together", label: "Family together" },
];

export const NURTURE_REASON_LABELS: Record<NurtureReason, string> = {
  budget_low: "Budget below range",
  location: "Location not Vasai West",
  configuration: "Configuration not available",
  exploring: "Still exploring",
  not_interested: "Not interested",
  not_reachable: "Not reachable",
  other: "Other",
};

export const GRADE_LABELS: Record<LeadGrade, string> = {
  A: "A — ready",
  B: "B — qualified, slower",
  C: "C — nurture",
};

export const GRADE_COLORS: Record<LeadGrade, string> = {
  A: "bg-emerald-100 text-emerald-800",
  B: "bg-amber-100 text-amber-800",
  C: "bg-slate-200 text-slate-700",
};

export type GradeBreakdown = {
  locationOk: boolean;
  configOk: boolean;
  budgetState: "within" | "stretch" | "below" | "missing";
  lowestPriceLakh: number | null;
  budgetMaxLakh: number | null;
  stretchPct: number;
  timeline: string | null;
  visitIntent: VisitIntent;
  intentAttempts: number;
};

export type GradeResult = {
  /** Null means "cannot grade yet" (visit intent not asked). */
  grade: LeadGrade | null;
  reason: string;
  nurtureReason: NurtureReason | null;
  breakdown: GradeBreakdown;
};

export type GradeInput = {
  location?: string | null;
  bhk?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  timeline?: string | null;
  visitIntent?: string | null;
  intentAttempts?: number | null;
  stretchPct?: number;
  notInterested?: boolean;
  notReachable?: boolean;
};

function normaliseBhk(value?: string | null): string | null {
  const match = String(value ?? "").match(/(\d+)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? String(n) : null;
}

/** Lowest listed price for one BHK across every active West project, in lakhs. */
export function lowestBhkPriceLakh(bhk: string): number | null {
  const wanted = normaliseBhk(bhk);
  if (!wanted) return null;

  let lowest: number | null = null;
  for (const project of projects) {
    if (desiredArea(project.location) !== "west") continue;
    if (!projectBhkOptions(project).includes(wanted)) continue;
    for (const config of project.configurations) {
      const configBhk = normaliseBhk(config.type);
      if (configBhk !== wanted) continue;
      const range = configBudgetRange(config.price);
      if (!range) continue;
      lowest = lowest == null ? range.min : Math.min(lowest, range.min);
    }
  }
  return lowest;
}

/** Does any active West project offer this BHK at all? */
export function bhkAvailable(bhk: string): boolean {
  const wanted = normaliseBhk(bhk);
  if (!wanted) return false;
  return projects.some(
    (project) =>
      desiredArea(project.location) === "west" && projectBhkOptions(project).includes(wanted),
  );
}

export function gradeLead(input: GradeInput): GradeResult {
  const intent = (input.visitIntent as VisitIntent) || "not_asked";
  const attempts = Math.max(0, Number(input.intentAttempts) || 0);
  const stretchPct =
    input.stretchPct != null && Number.isFinite(input.stretchPct)
      ? Math.min(50, Math.max(0, input.stretchPct))
      : 10;
  const bhk = normaliseBhk(input.bhk);
  const locationOk = desiredArea(input.location) === "west";
  const configOk = !!bhk && bhkAvailable(bhk);
  const lowest = configOk ? lowestBhkPriceLakh(bhk!) : null;
  const budgetMax =
    input.budgetMax != null && Number.isFinite(Number(input.budgetMax))
      ? Number(input.budgetMax)
      : null;

  let budgetState: GradeBreakdown["budgetState"] = "missing";
  if (budgetMax != null && lowest != null) {
    if (budgetMax >= lowest) budgetState = "within";
    else if (budgetMax >= lowest * (1 - stretchPct / 100)) budgetState = "stretch";
    else budgetState = "below";
  }

  const breakdown: GradeBreakdown = {
    locationOk,
    configOk,
    budgetState,
    lowestPriceLakh: lowest,
    budgetMaxLakh: budgetMax,
    stretchPct,
    timeline: input.timeline ?? null,
    visitIntent: intent,
    intentAttempts: attempts,
  };

  const c = (reason: string, nurtureReason: NurtureReason): GradeResult => ({
    grade: "C",
    reason: `C: ${reason}`,
    nurtureReason,
    breakdown,
  });

  if (!locationOk) return c("location outside Vasai West", "location");
  if (!configOk) return c("configuration not available", "configuration");
  if (budgetState === "missing") return c("budget not captured", "budget_low");
  if (budgetState === "below") {
    return c(`budget below range (₹${lowest?.toFixed(2)}L minimum)`, "budget_low");
  }
  if (input.notInterested) return c("not interested", "not_interested");
  if (input.notReachable) return c("not reachable after retries", "not_reachable");
  if (intent === "not_asked") {
    return {
      grade: null,
      reason: "Visit intent not asked yet",
      nurtureReason: null,
      breakdown,
    };
  }
  if (intent === "no") return c("refused a site visit", "not_interested");
  if (intent === "maybe" && attempts >= 2) {
    return c("still undecided after two follow-ups", "exploring");
  }

  const withinThreeMonths = input.timeline === "immediate" || input.timeline === "1_3_months";
  if (intent === "yes" && withinThreeMonths && budgetState === "within") {
    return {
      grade: "A",
      reason: "A: fits budget, ready within 3 months, agreed to visit",
      nurtureReason: null,
      breakdown,
    };
  }

  let reason = "qualified but not ready";
  if (budgetState === "stretch") {
    reason = `budget is a stretch (up to ${stretchPct}% below the lowest unit)`;
  } else if (!withinThreeMonths) {
    reason = input.timeline === "exploring" ? "still exploring" : "timeline over 3 months";
  } else if (intent === "maybe") {
    reason = "visit intent still maybe";
  }

  return {
    grade: "B",
    reason: `B: ${reason}`,
    nurtureReason: null,
    breakdown,
  };
}

/** The grade a stored lead would get with the latest settings, or null if incomplete. */
export function gradeForLead(
  lead: {
    location?: string | null;
    bhk?: string | null;
    budgetMin?: number | null;
    budgetMax?: number | null;
    timeline?: string | null;
    visitIntent?: string | null;
    visitIntentAttempts?: number | null;
  },
  stretchPct?: number,
): GradeResult {
  return gradeLead({
    location: lead.location,
    bhk: lead.bhk,
    budgetMin: lead.budgetMin,
    budgetMax: lead.budgetMax,
    timeline: lead.timeline,
    visitIntent: lead.visitIntent,
    intentAttempts: lead.visitIntentAttempts,
    stretchPct,
  });
}
