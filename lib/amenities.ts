export type AmenityOption = { key: string; label: string };

export type AmenityCategory = "convenience" | "safety" | "sports" | "leisure";

/**
 * Fixed master list of amenities (project level).
 * Add new entries here and they appear in the CRM form and recommendations.
 */
export const AMENITY_OPTIONS: AmenityOption[] = [
  { key: "lift", label: "Lift" },
  { key: "power_backup", label: "Power Backup" },
  { key: "security", label: "24x7 Security" },
  { key: "cctv", label: "CCTV Surveillance" },
  { key: "gym", label: "Gymnasium" },
  { key: "swimming_pool", label: "Swimming Pool" },
  { key: "clubhouse", label: "Clubhouse" },
  { key: "kids_play_area", label: "Kids Play Area" },
  { key: "garden", label: "Landscaped Garden" },
  { key: "jogging_track", label: "Jogging Track" },
  { key: "community_hall", label: "Community Hall" },
  { key: "water_supply", label: "24x7 Water Supply" },
  { key: "fire_safety", label: "Fire Safety" },
  { key: "rainwater_harvesting", label: "Rainwater Harvesting" },
  { key: "waste_management", label: "Waste Management" },
  { key: "amphitheatre", label: "Amphitheatre" },
  { key: "indoor_games", label: "Indoor Games" },
  { key: "co_working", label: "Co-working Space" },
  { key: "ev_charging", label: "EV Charging Point" },
  { key: "piped_gas", label: "Piped Gas" },
  { key: "intercom", label: "Intercom" },
  { key: "vaastu", label: "Vaastu Compliant" },
];

const CATEGORY_BY_KEY: Record<string, AmenityCategory> = {
  lift: "convenience",
  power_backup: "convenience",
  security: "safety",
  cctv: "safety",
  gym: "sports",
  swimming_pool: "leisure",
  clubhouse: "leisure",
  kids_play_area: "sports",
  garden: "leisure",
  jogging_track: "sports",
  community_hall: "leisure",
  water_supply: "convenience",
  fire_safety: "safety",
  rainwater_harvesting: "convenience",
  waste_management: "convenience",
  amphitheatre: "leisure",
  indoor_games: "leisure",
  co_working: "convenience",
  ev_charging: "convenience",
  piped_gas: "convenience",
  intercom: "convenience",
  vaastu: "leisure",
};

const LABELS = new Map(AMENITY_OPTIONS.map((a) => [a.key, a.label]));
const KEYS_BY_LABEL = new Map(AMENITY_OPTIONS.map((a) => [a.label, a.key]));

export function amenityLabel(key: string): string {
  return LABELS.get(key) ?? key;
}

export function amenityLabels(keys: string[] | undefined | null): string[] {
  return (keys ?? []).map(amenityLabel);
}

/**
 * Amenity keys extracted from a legacy per-configuration list or a
 * project-level list, preserving the master checklist order.
 */
export function amenityKeys(
  value: unknown,
  labels: string[] | undefined = []
): string[] {
  const keys = new Set<string>();
  if (Array.isArray(value)) {
    for (const k of value) {
      if (typeof k === "string" && k.trim()) keys.add(k);
    }
  }
  for (const l of labels) {
    const k = KEYS_BY_LABEL.get(l) ?? LABELS.get(l);
    if (k) keys.add(k);
  }
  return AMENITY_OPTIONS.filter((o) => keys.has(o.key)).map((o) => o.key);
}

/**
 * Groups a flat project-level amenity list into display categories
 * (returns labels, mirroring the legacy public site layout).
 */
export function categorizeAmenities(
  keys: string[] | undefined | null
): Record<AmenityCategory, string[]> {
  const out: Record<AmenityCategory, string[]> = {
    convenience: [],
    safety: [],
    sports: [],
    leisure: [],
  };
  for (const a of AMENITY_OPTIONS) {
    if ((keys ?? []).includes(a.key)) out[CATEGORY_BY_KEY[a.key]].push(a.label);
  }
  return out;
}
