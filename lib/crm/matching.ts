import { projects, subLocationMatches, type Project } from "@/lib/projects";
import { amenityLabel } from "@/lib/amenities";
import {
  MARKET_AREA,
  MARKET_LOCATION,
  marketBhkOptions,
  marketPossessionLabel,
  marketPriceByBhk,
  marketPriceLabel,
  marketPriceRange,
  marketSlug,
  publishedMarketInventory,
  type MarketInventoryEntry,
} from "./market-inventory";
import type { MatchingWeights } from "./settings";

export type MatchLevel = "strong" | "medium" | "low";
export type MatchSource = "primary" | "market";
export type MatchTone = "good" | "warn" | "bad";

const DEFAULT_WEIGHTS: MatchingWeights = {
  subLocation: 40,
  location: 20,
  budget: 25,
  budgetPartial: 10,
};

export type { MarketInventoryEntry };

export type MatchReason = { label: string; ok: boolean; tone?: MatchTone };

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
  reasons: MatchReason[];
  source: MatchSource;
  developer?: string;
  subLocation?: string;
  priceValidUntil?: string;
};

type Setter = {
  budgetMin?: number | null;
  budgetMax?: number | null;
  location?: string | null;
  subLocation?: string | null;
  bhk?: string | null;
  timeline?: string | null;
  purpose?: string | null;
  preferredProject?: string | null;
  familyRequirements?: string | null;
  otherPreferences?: string | null;
};

/**
 * Internal, source-agnostic view of a candidate so website projects and
 * partner-network inventory are scored by exactly the same code path.
 */
type Candidate = {
  slug: string;
  title: string;
  location: string;
  subLocation: string | null;
  area: "west" | "east";
  bhkOptions: string[];
  priceRange: { min: number; max: number } | null;
  priceByBhk: Record<string, { min: number; max: number }>;
  priceLabel: string;
  possessionLabel: string;
  tier: string | null;
  type: string;
  reraId: string;
  image?: string;
  priceValidUntil?: string;
  developer?: string;
  source: MatchSource;
  extras: { allInclusive: boolean; parkingIncluded: boolean; amenities: string[] };
};

type LocationTier = "sub" | "area" | "none" | "neutral";
type BudgetFit = "full" | "partial" | "none" | "unknown";

const LEVEL_RANK: Record<MatchLevel, number> = { strong: 2, medium: 1, low: 0 };
const BUDGET_RANK: Record<BudgetFit, number> = { full: 3, partial: 2, unknown: 1, none: 0 };

function parseLakhs(value: string): number | null {
  const clean = value.replace(/[,₹]/g, "").trim();
  const m = clean.match(/([\d.]+)\s*(lakh|lac|lacs|cr|crore)/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (isNaN(num)) return null;
  if (/cr|crore/i.test(m[2])) return num * 100;
  return num;
}

function projectBudgetRange(p: Project): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const c of p.configurations) {
    const range = configBudgetRange(c.price);
    if (!range) continue;
    min = Math.min(min, range.min);
    max = Math.max(max, range.max);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

function configBudgetRange(price: string): { min: number; max: number } | null {
  const nums = (price.match(/₹?([\d,.]+)\s*(Lacs?|Cr|Lakh|Lakhs?)/gi) || [])
    .map(parseLakhs)
    .filter((n): n is number => n != null);
  if (nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

function projectBhkOptions(p: Project): string[] {
  const out = new Set<string>();
  for (const c of p.configurations) {
    const m = c.type.match(/(\d+)\s*BHK/i);
    if (m) out.add(m[1]);
  }
  return [...out];
}

function desiredArea(desired?: string | null): "west" | "east" | null {
  if (!desired) return null;
  const d = desired.toLowerCase();
  if (d.includes("west")) return "west";
  if (d.includes("east")) return "east";
  return null;
}

function areaLabel(area: "west" | "east"): string {
  return area === "west" ? "Vasai West" : "Vasai East";
}

function locationLabel(value?: string | null): string {
  if (!value) return "";
  const map: Record<string, string> = {
    vasai_west: "Vasai West",
    vasai_east: "Vasai East",
    naigaon: "Naigaon",
    nalasopara: "Nalasopara",
    virar: "Virar",
    other: "Other",
  };
  return map[value.toLowerCase()] || value;
}

function budgetFit(
  priceRange: { min: number; max: number } | null,
  bMin?: number | null,
  bMax?: number | null,
): BudgetFit {
  const hasAsk = bMin != null || bMax != null;
  if (!hasAsk) return "unknown";
  if (!priceRange) return "unknown";
  const leadMin = bMin ?? 0;
  const leadMax = bMax ?? Number.POSITIVE_INFINITY;
  const { min: pMin, max: pMax } = priceRange;
  if (pMin >= leadMin && pMax <= leadMax) return "full";
  const span = Number.isFinite(leadMax) ? leadMax - leadMin : Number.POSITIVE_INFINITY;
  const tol = Number.isFinite(span) ? span * 0.15 : Number.POSITIVE_INFINITY;
  if (pMin <= leadMax + tol && pMax >= leadMin - tol) return "partial";
  return "none";
}

function projectToCandidate(p: Project): Candidate {
  const configs = p.configurations ?? [];
  const priceByBhk: Record<string, { min: number; max: number }> = {};
  for (const cfg of configs) {
    const m = cfg.type.match(/(\d+)\s*BHK/i);
    if (!m) continue;
    const range = configBudgetRange(cfg.price);
    if (!range) continue;
    const key = m[1];
    const existing = priceByBhk[key];
    priceByBhk[key] = existing
      ? { min: Math.min(existing.min, range.min), max: Math.max(existing.max, range.max) }
      : range;
  }
  return {
    slug: p.slug,
    title: p.title,
    location: p.location,
    subLocation: p.subLocation ?? null,
    area: p.area === "east" ? "east" : "west",
    bhkOptions: projectBhkOptions(p),
    priceRange: projectBudgetRange(p),
    priceByBhk,
    priceLabel: p.priceRange,
    possessionLabel: p.possessionDate,
    tier: p.tier ?? null,
    type: p.type,
    reraId: p.reraId,
    image: p.images?.[0],
    priceValidUntil: p.priceValidUntil,
    developer: p.developer?.name,
    source: "primary",
    extras: {
      allInclusive: configs.some((c) => c.allInclusive === true),
      parkingIncluded: configs.some((c) => c.parkingIncluded === true),
      amenities: [...new Set(p.amenities ?? [])],
    },
  };
}

function marketToCandidate(e: MarketInventoryEntry): Candidate {
  return {
    slug: marketSlug(e),
    title: e.project,
    location: `${MARKET_LOCATION} · Partner`,
    subLocation: e.subLocation ?? null,
    area: MARKET_AREA,
    bhkOptions: marketBhkOptions(e),
    priceRange: marketPriceRange(e),
    priceByBhk: marketPriceByBhk(e),
    priceLabel: marketPriceLabel(e),
    possessionLabel: marketPossessionLabel(e),
    tier: null,
    type: "flat",
    reraId: "",
    source: "market",
    extras: { allInclusive: false, parkingIncluded: false, amenities: [] },
  };
}

type Scored = {
  score: number;
  level: MatchLevel;
  reasons: MatchReason[];
  locationTier: LocationTier;
  budget: BudgetFit;
  bhkOk: boolean;
};

function scoreCandidate(c: Candidate, setter: Setter, weights: MatchingWeights): Scored {
  const hasSub = !!setter.subLocation;
  const hasLoc = !!setter.location;
  const hasBudget = setter.budgetMin != null || setter.budgetMax != null;
  const hasBhk = !!setter.bhk && setter.bhk !== "other";
  const wantArea = desiredArea(setter.location);

  const subMatch = hasSub && subLocationMatches(c.subLocation, setter.subLocation);
  const areaMatch = wantArea != null && c.area === wantArea;

  let locationTier: LocationTier;
  if (subMatch) locationTier = "sub";
  else if (areaMatch) locationTier = "area";
  else if (!hasSub && !hasLoc) locationTier = "neutral";
  else if (wantArea == null) locationTier = "neutral";
  else locationTier = "none";

  const locationPoints =
    locationTier === "sub"
      ? weights.subLocation
      : locationTier === "area"
        ? weights.location
        : 0;

  const effectiveRange =
    hasBhk && c.priceByBhk[setter.bhk!] ? c.priceByBhk[setter.bhk!] : c.priceRange;
  const budget = budgetFit(effectiveRange, setter.budgetMin, setter.budgetMax);
  const budgetPoints = budget === "full" ? weights.budget : budget === "partial" ? weights.budgetPartial : 0;

  const bhkOk = !hasBhk || c.bhkOptions.includes(setter.bhk!);

  const locCap = hasSub ? weights.subLocation : hasLoc ? weights.location : 0;
  const budgetCap = hasBudget ? weights.budget : 0;
  const cap = locCap + budgetCap;
  const raw = locationPoints + budgetPoints;
  const baseScore = cap > 0 ? Math.round((raw / cap) * 100) : 50;

  // Better-equipped units (parking, all-inclusive pricing, ticked amenities)
  // get a bounded boost so they rank above comparable bare-shell options.
  const extrasPoints =
    (c.extras.parkingIncluded ? 5 : 0) +
    (c.extras.allInclusive ? 3 : 0) +
    Math.min(c.extras.amenities.length, 7);
  const score = Math.min(100, baseScore + extrasPoints);

  const budgetBlocks = budget === "none";
  let level: MatchLevel;
  if (bhkOk && !budgetBlocks && score >= 80) level = "strong";
  else if (bhkOk && score >= 50) level = "medium";
  else level = "low";

  // When the lead asked for a specific sub-location, only an exact
  // sub-location match can be BEST — area matches stay at GOOD or below.
  if (hasSub && locationTier !== "sub" && level === "strong") level = "medium";

  const reasons: MatchReason[] = [];

  if (hasSub) {
    reasons.push(
      subMatch
        ? { label: `Sub-location: ${c.subLocation}`, ok: true, tone: "good" }
        : { label: `Not in ${setter.subLocation}`, ok: false, tone: "bad" },
    );
  }

  if (hasLoc) {
    if (wantArea == null) {
      reasons.push({ label: locationLabel(setter.location), ok: true, tone: "warn" });
    } else if (areaMatch) {
      reasons.push({ label: areaLabel(wantArea), ok: true, tone: "good" });
    } else {
      reasons.push({ label: `Not ${areaLabel(wantArea)}`, ok: false, tone: "bad" });
    }
  }

  if (hasBudget) {
    if (budget === "full") reasons.push({ label: "Budget fits", ok: true, tone: "good" });
    else if (budget === "partial") reasons.push({ label: "Budget near match", ok: true, tone: "warn" });
    else if (budget === "unknown") reasons.push({ label: "Price on request", ok: false, tone: "warn" });
    else reasons.push({ label: "Budget out of range", ok: false, tone: "bad" });
  }

  if (hasBhk) {
    reasons.push(
      bhkOk
        ? { label: `${setter.bhk} BHK available`, ok: true, tone: "good" }
        : { label: `No ${setter.bhk} BHK`, ok: false, tone: "bad" },
    );
  }

  if (c.extras.parkingIncluded) {
    reasons.push({ label: "Parking included", ok: true, tone: "good" });
  }
  if (c.extras.allInclusive) {
    reasons.push({ label: "All-inclusive price", ok: true, tone: "good" });
  }
  const amenityNames = c.extras.amenities.map(amenityLabel);
  for (const name of amenityNames.slice(0, 4)) {
    reasons.push({ label: name, ok: true, tone: "good" });
  }
  if (amenityNames.length > 4) {
    reasons.push({ label: `+${amenityNames.length - 4} more amenities`, ok: true, tone: "good" });
  }

  return { score, level, reasons, locationTier, budget, bhkOk };
}

function toPropertyMatch(c: Candidate, s: Scored): PropertyMatch {
  return {
    projectSlug: c.slug,
    title: c.title,
    location: c.location,
    tier: c.tier,
    type: c.type,
    priceRange: c.priceLabel,
    possessionDate: c.possessionLabel,
    reraId: c.reraId,
    image: c.image,
    score: s.score,
    level: s.level,
    bhkOptions: c.bhkOptions,
    reasons: s.reasons,
    source: c.source,
    developer: c.developer,
    subLocation: c.subLocation ?? undefined,
    priceValidUntil: c.priceValidUntil,
  };
}

/**
 * Deterministic property matching shared by the CRM lead detail, dashboard
 * price-expiry alerts, reactivation scans and partner inventory.
 *
 * Location: an exact sub-location match is worth `subLocation`; failing that a
 * same-area match is worth `location`; anything with no location relevance to
 * the lead is dropped. Budget overlap is worth `budget` (full) or
 * `budgetPartial` (within 15% of the lead's band). BHK is a hard filter – a
 * configuration mismatch can never score above ALTERNATIVE. The raw score is
 * normalised against only the criteria the lead actually specified, so a lead
 * that only gave a location is not penalised for not having a budget.
 */
export function matchProperties(
  setter: Setter,
  limit = 5,
  weights: MatchingWeights = DEFAULT_WEIGHTS,
  includeMarket = true,
): PropertyMatch[] {
  const candidates: Candidate[] = projects.map(projectToCandidate);
  if (includeMarket) {
    for (const e of publishedMarketInventory) candidates.push(marketToCandidate(e));
  }

  const scored = candidates
    .map((c) => ({ c, s: scoreCandidate(c, setter, weights) }))
    .filter(({ s }) => s.locationTier !== "none");

  scored.sort((a, b) => {
    const byLevel = LEVEL_RANK[b.s.level] - LEVEL_RANK[a.s.level];
    if (byLevel !== 0) return byLevel;
    if (b.s.score !== a.s.score) return b.s.score - a.s.score;
    const byBudget = BUDGET_RANK[b.s.budget] - BUDGET_RANK[a.s.budget];
    if (byBudget !== 0) return byBudget;
    if (b.s.bhkOk !== a.s.bhkOk) return b.s.bhkOk ? 1 : -1;
    return a.c.title.localeCompare(b.c.title);
  });

  return scored.slice(0, limit).map(({ c, s }) => toPropertyMatch(c, s));
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
