import { projects, type Project } from "@/lib/projects";
import type { MatchingWeights } from "./settings";

export type MatchLevel = "strong" | "medium" | "low";

const DEFAULT_WEIGHTS: MatchingWeights = {
  budget: 30,
  location: 20,
  bhk: 15,
  timeline: 15,
  purpose: 10,
  preferences: 10,
};

export type PropertyMatch = {
  projectSlug: string;
  title: string;
  location: string;
  tier: string | null;
  type: string;
  priceRange: string;
  possessionDate: string;
  reraId: string;
  image?: string;
  score: number;
  level: MatchLevel;
  bhkOptions: string[];
  reasons: { label: string; ok: boolean }[];
};

type Setter = {
  budgetMin?: number | null;
  budgetMax?: number | null;
  location?: string | null;
  bhk?: string | null;
  timeline?: string | null;
  purpose?: string | null;
  preferredProject?: string | null;
  familyRequirements?: string | null;
  otherPreferences?: string | null;
};

function parseLakhs(value: string): number | null {
  const clean = value.replace(/[,₹]/g, "").trim();
  const m = clean.match(/([\d.]+)\s*(lakh|lac|lacs|cr|crore)/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (isNaN(num)) return null;
  if (/cr|crore/i.test(m[2])) return num * 100;
  return num;
}

function projectBudgetRange(p: Project): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const c of p.configurations) {
    const nums = (c.price.match(/₹?([\d,.]+)\s*(Lacs?|Cr|Lakh|Lakhs?)/gi) || []).map(parseLakhs);
    for (const n of nums) {
      if (n == null) continue;
      min = Math.min(min, n);
      max = Math.max(max, n);
    }
    const start = parseLakhs(c.price);
    if (start != null) {
      min = Math.min(min, start);
      max = Math.max(max, start);
    }
  }
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;
  return { min, max };
}

function projectBhkOptions(p: Project): string[] {
  const out = new Set<string>();
  for (const c of p.configurations) {
    const m = c.type.match(/(\d+)\s*BHK/i);
    if (m) out.add(m[1]);
  }
  return [...out];
}

function areaMatches(projectArea: string, projectLocation: string, desired?: string | null): boolean {
  if (!desired) return false;
  const d = desired.toLowerCase().trim();
  const loc = projectLocation.toLowerCase();
  const area = projectArea === "west" ? "vasai west" : "vasai east";
  return loc.includes(d) || d.includes("vasai") && area.includes(d) || d.includes(area);
}

function possessionYear(p: Project): number | null {
  const m = p.possessionDate.match(/(20\d{2})/);
  return m ? parseInt(m[1], 10) : null;
}

function timelineBudgetYear(timeline?: string | null): number {
  const year = new Date().getFullYear();
  switch (timeline) {
    case "immediate":
      return year;
    case "1_3_months":
      return year + 1;
    case "3_6_months":
      return year + 1;
    case "6_plus_months":
      return year + 2;
    case "exploring":
      return year + 3;
    default:
      return year + 3;
  }
}

function budgetFits(pMin: number, pMax: number, bMin?: number | null, bMax?: number | null): boolean {
  if (bMin == null && bMax == null) return true;
  const leadMin = bMin ?? 0;
  const leadMax = bMax ?? Infinity;
  return pMin <= leadMax + 5 && pMax >= leadMin - 5;
}

export function matchProperties(setter: Setter, limit = 5, weights: MatchingWeights = DEFAULT_WEIGHTS): PropertyMatch[] {
  const maxWeight = weights.budget + weights.location + weights.bhk + weights.timeline + weights.purpose + weights.preferences;
  const hasBudget = setter.budgetMin != null || setter.budgetMax != null;
  const bMin = setter.budgetMin ?? 0;
  const bMax = setter.budgetMax ?? Infinity;

  const results: PropertyMatch[] = [];

  for (const p of projects) {
    const reasons: { label: string; ok: boolean }[] = [];
    let w = 0;

    const { min: pMin, max: pMax } = projectBudgetRange(p);
    if (hasBudget) {
      if (budgetFits(pMin, pMax, bMin, bMax)) {
        w += weights.budget;
        reasons.push({ label: "Budget fits", ok: true });
      } else {
        reasons.push({ label: "Budget out of range", ok: false });
      }
    }

    if (areaMatches(p.area, p.location, setter.location)) {
      w += weights.location;
      reasons.push({ label: p.location, ok: true });
    } else {
      reasons.push({ label: p.location, ok: false });
    }

    const bhkOpts = projectBhkOptions(p);
    if (setter.bhk && setter.bhk !== "other") {
      if (bhkOpts.includes(setter.bhk)) {
        w += weights.bhk;
        reasons.push({ label: `${setter.bhk} BHK available`, ok: true });
      } else {
        reasons.push({ label: `No ${setter.bhk} BHK`, ok: false });
      }
    }

    if (setter.timeline && setter.timeline !== "exploring") {
      const py = possessionYear(p);
      if (py != null && py <= timelineBudgetYear(setter.timeline)) {
        w += weights.timeline;
        reasons.push({ label: "Suitable possession timeline", ok: true });
      } else if (py != null) {
        reasons.push({ label: `Possession ${p.possessionDate}`, ok: false });
      }
    }

    if (setter.purpose && setter.purpose !== "self_use") {
      if (p.type === "shop" || setter.purpose === "both") {
        w += weights.purpose;
        reasons.push({ label: "Good for investment", ok: true });
      } else {
        reasons.push({ label: "Residential project", ok: true });
        w += weights.purpose / 2;
      }
    }

    if (setter.preferredProject) {
      if (p.slug === setter.preferredProject || p.title.toLowerCase().includes(setter.preferredProject.toLowerCase())) {
        w += weights.preferences;
        reasons.push({ label: "Preferred project", ok: true });
      }
    }

    if (setter.otherPreferences || setter.familyRequirements) {
      const pref = `${setter.otherPreferences || ""} ${setter.familyRequirements || ""}`.toLowerCase();
      const amens = Object.values(p.amenities).flat().join(" ").toLowerCase();
      if (pref && amens && pref.split(" ").some((word) => amens.includes(word))) {
        w += weights.preferences;
        reasons.push({ label: "Matches preferences", ok: true });
      }
    }

    const score = maxWeight > 0 ? Math.round((w / maxWeight) * 100) : 60;
    const level: MatchLevel = score >= 75 ? "strong" : score >= 50 ? "medium" : "low";

    results.push({
      projectSlug: p.slug,
      title: p.title,
      location: p.location,
      tier: p.tier ?? null,
      type: p.type,
      priceRange: p.priceRange,
      possessionDate: p.possessionDate,
      reraId: p.reraId,
      image: p.images?.[0],
      score,
      level,
      bhkOptions: bhkOpts,
      reasons: reasons.slice(0, 5),
    });
  }

  return results
    .sort((a, b) => b.score - a.score || (a.reasons.filter((r) => r.ok).length - b.reasons.filter((r) => r.ok).length))
    .slice(0, limit);
}

export function matchLevelMeta(level: MatchLevel) {
  switch (level) {
    case "strong":
      return { label: "BEST MATCH", cls: "bg-emerald-100 text-emerald-800" };
    case "medium":
      return { label: "GOOD MATCH", cls: "bg-amber-100 text-amber-800" };
    default:
      return { label: "ALTERNATIVE", cls: "bg-slate-100 text-slate-600" };
  }
}