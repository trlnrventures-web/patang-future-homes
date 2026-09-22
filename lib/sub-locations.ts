import rawProjects from "@/data/projects.json";

type WithSubLocation = { subLocation?: string | null; status?: string };

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

function collectSubLocations(includeDrafts: boolean): string[] {
  const byKey = new Map<string, string>();
  const add = (value?: string | null) => {
    for (const token of subLocationTokens(value)) {
      const key = token.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, token);
    }
  };
  for (const p of rawProjects as WithSubLocation[]) {
    if (!includeDrafts && p.status === "draft") continue;
    add(p.subLocation);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Published sub-locations only (drafts excluded) — used by the public
 * website filters and the lead requirement form.
 */
export const SUB_LOCATIONS: string[] = collectSubLocations(false);

/**
 * Every sub-location in the catalogue, including draft listings — used by
 * the CRM property form so saved draft sub-locations always stay selectable.
 */
export const ALL_SUB_LOCATIONS: string[] = collectSubLocations(true);

export function subLocationMatches(projectValue?: string | null, leadValue?: string | null): boolean {
  const pTokens = subLocationTokens(projectValue);
  if (pTokens.length === 0 || !leadValue) return false;
  const lTokens = subLocationTokens(leadValue);
  const norm = (s: string) => s.toLowerCase().trim();
  return pTokens.some((pt) => lTokens.some((lt) => norm(pt) === norm(lt)));
}