import rawMarketInventory from "@/data/market-inventory.json";

/**
 * Broker / partner inventory. Not shown on the public website — CRM only.
 * All entries are Vasai West. Prices are in lakhs; possession is a list of
 * raw status strings as supplied by the partner network.
 */
export type MarketInventoryEntry = {
  project: string;
  subLocation?: string | null;
  priceRangeLacs: [number, number] | null;
  carpetRangeSqft: [number, number];
  possession: string[] | null;
};

export const MARKET_LOCATION = "Vasai West";
export const MARKET_AREA = "west" as const;

export const marketInventory = rawMarketInventory as MarketInventoryEntry[];

export function marketSlug(entry: MarketInventoryEntry): string {
  return `partner-${entry.project.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

/**
 * Carpet-area bands used to infer available configurations for partner
 * inventory, which only exposes a carpet range. A project "has" a BHK when its
 * carpet range overlaps that band's range.
 */
const BHK_BANDS: { bhk: string; min: number; max: number }[] = [
  { bhk: "1", min: 250, max: 620 },
  { bhk: "2", min: 500, max: 820 },
  { bhk: "3", min: 700, max: 1250 },
  { bhk: "4", min: 1100, max: Number.POSITIVE_INFINITY },
];

export function marketBhkOptions(entry: MarketInventoryEntry): string[] {
  const [lo, hi] = entry.carpetRangeSqft;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  return BHK_BANDS.filter((band) => hi >= band.min && lo <= band.max).map((band) => band.bhk);
}

export function marketPriceRange(entry: MarketInventoryEntry): { min: number; max: number } | null {
  if (!entry.priceRangeLacs) return null;
  const [min, max] = entry.priceRangeLacs;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

export function marketPriceLabel(entry: MarketInventoryEntry): string {
  const range = marketPriceRange(entry);
  if (!range) return "Price on request";
  const fmt = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}L`;
  return range.min === range.max ? fmt(range.min) : `${fmt(range.min)} – ${fmt(range.max)}`;
}

export function marketPossessionLabel(entry: MarketInventoryEntry): string {
  if (!entry.possession || entry.possession.length === 0) return "On request";
  const unique = [...new Set(entry.possession.map((p) => p.trim()).filter(Boolean))];
  return unique.length === 0 ? "On request" : unique.join(", ");
}
