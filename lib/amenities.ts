export type AmenityOption = { key: string; label: string };

/**
 * Fixed master list of amenities that can be ticked per configuration.
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

const LABELS = new Map(AMENITY_OPTIONS.map((a) => [a.key, a.label]));

export function amenityLabel(key: string): string {
  return LABELS.get(key) ?? key;
}

export function amenityLabels(keys: string[] | undefined | null): string[] {
  return (keys ?? []).map(amenityLabel);
}
