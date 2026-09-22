import rawProjects from "@/data/projects.json";
import rawMarketInventory from "@/data/market-inventory.json";

type WithSubLocation = { subLocation?: string | null };

/** Partner-inventory rows; drafts are not yet published to the public site. */
type MarketRow = WithSubLocation & { status?: string };

/**
 * Split a raw sub-location value into individual, canonical tokens.
 * Compound values such as "Koliwada/Suruchi Beach" or "Ram Nagar/Mulgaon"
 * resolve to their constituent areas so every filter/dropdown can match them.
 */
export function subLocationTokens(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[\/,&]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function collectSubLocations(): string[] {
  const byKey = new Map<string, string>();
  const add = (value?: string | null) => {
    for (const token of subLocationTokens(value)) {
      const key = token.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, token);
    }
  };
  for (const p of rawProjects as WithSubLocation[]) add(p.subLocation);
  for (const m of rawMarketInventory as MarketRow[]) {
    if (m.status === "draft") continue;
    add(m.subLocation);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * The single shared source of truth for sub-locations across the whole app.
 * Derived dynamically from data/projects.json + data/market-inventory.json
 * (draft partner entries excluded), so the website filter, CRM property form,
 * lead requirement form and the matching engine can never drift out of sync
 * with the actual data.
 */
export const SUB_LOCATIONS: string[] = collectSubLocations();

export function subLocationMatches(projectValue?: string | null, leadValue?: string | null): boolean {
  const pTokens = subLocationTokens(projectValue);
  if (pTokens.length === 0 || !leadValue) return false;
  const lTokens = subLocationTokens(leadValue);
  const norm = (s: string) => s.toLowerCase().trim();
  return pTokens.some((pt) => lTokens.some((lt) => norm(pt) === norm(lt)));
}
