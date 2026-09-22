import rawMarketInventory from "@/data/market-inventory.json";

/**
 * Broker / partner inventory. Not shown on the public website — CRM only.
 * All entries are Vasai West. Each entry carries explicit configurations
 * (BHK type, carpet area range, price range) sourced directly from the
 * partner's master sheets — no carpet-area inference.
 *
 * `status` gates visibility in lead matching: entries stay `draft` until an
 * Admin/SM reviews and publishes them. Draft entries are excluded from the
 * public website and from `matchProperties`.
 */
export type MarketConfig = {
  type: string;
  carpetAreaRange: [number, number];
  priceRangeLacs: [number, number] | null;
};

export type MarketInventoryEntry = {
  project: string;
  location: string;
  subLocation: string;
  possession: string | null;
  category: "primary" | "resale";
  status: "draft" | "published";
  configurations: MarketConfig[];
};

export const MARKET_LOCATION = "Vasai West";
export const MARKET_AREA = "west" as const;

/** Fixed configuration-type options shared by the partner inventory and the
 *  property Configuration Type field, so BHK values always map onto the same
 *  closed set. */
export const MARKET_CONFIG_TYPES = [
  "1 BHK",
  "2 BHK",
  "3 BHK",
  "4 BHK",
  "5 BHK",
  "Shop",
  "Office",
] as const;

export const marketInventory = rawMarketInventory as MarketInventoryEntry[];

/** Entries that have been reviewed and published (any non-draft state). */
export const publishedMarketInventory = marketInventory.filter(
  (e) => e.status !== "draft",
);

export function marketSlug(entry: MarketInventoryEntry): string {
  return `partner-${entry.project.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

/** BHK from an explicit "N BHK" configuration type; null for Shop/Office. */
function configBhk(config: MarketConfig): string | null {
  const m = config.type.trim().match(/^(\d+)\s+bhk$/i);
  return m ? m[1] : null;
}

/** Explicit BHKs from the entry's configurations — never carpet-inferred. */
export function marketBhkOptions(entry: MarketInventoryEntry): string[] {
  const out = new Set<string>();
  for (const c of entry.configurations ?? []) {
    const b = configBhk(c);
    if (b) out.add(b);
  }
  return [...out];
}

/** Per-BHK price bands taken from each configuration's own price range. */
export function marketPriceByBhk(
  entry: MarketInventoryEntry,
): Record<string, { min: number; max: number }> {
  const by: Record<string, { min: number; max: number }> = {};
  for (const c of entry.configurations ?? []) {
    const b = configBhk(c);
    if (!b || !c.priceRangeLacs) continue;
    const [min, max] = c.priceRangeLacs;
    if (!Number.isFinite(min) || !Number.isFinite(max)) continue;
    const existing = by[b];
    by[b] = existing
      ? { min: Math.min(existing.min, min), max: Math.max(existing.max, max) }
      : { min, max };
  }
  return by;
}

/** Overall price band across all priced configurations, or null. */
export function marketPriceRange(
  entry: MarketInventoryEntry,
): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const c of entry.configurations ?? []) {
    if (!c.priceRangeLacs) continue;
    const [lo, hi] = c.priceRangeLacs;
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    min = Math.min(min, lo);
    max = Math.max(max, hi);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

function lakhsLabel(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}L`;
}

function rangeLabel(range: { min: number; max: number }): string {
  return range.min === range.max
    ? lakhsLabel(range.min)
    : `${lakhsLabel(range.min)} – ${lakhsLabel(range.max)}`;
}

export function marketPriceLabel(entry: MarketInventoryEntry): string {
  const range = marketPriceRange(entry);
  return range ? rangeLabel(range) : "Price on request";
}

export function marketConfigPriceLabel(config: MarketConfig): string {
  if (!config.priceRangeLacs) return "Price on request";
  return rangeLabel({ min: config.priceRangeLacs[0], max: config.priceRangeLacs[1] });
}

export function marketPossessionLabel(entry: MarketInventoryEntry): string {
  const p = (entry.possession ?? "").trim();
  return p ? p : "On request";
}