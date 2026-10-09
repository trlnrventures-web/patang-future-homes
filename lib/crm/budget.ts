/**
 * Budget-range presets, shared by the lead editor and the settings screen.
 *
 * The stored setting is a list of range *keys* rather than labels, so the
 * wording can change without a migration and an unknown key can be dropped
 * safely. Kept free of any database import so the client can render the
 * defaults before the admin's saved list arrives.
 */

export type BudgetPreset = {
  key: string;
  label: string;
  /** Lakhs, or null for "no lower/upper bound". */
  min: number | null;
  max: number | null;
};

export const BUDGET_RANGE_DEFS: Record<string, Omit<BudgetPreset, "key">> = {
  under_25: { label: "Under ₹25L", min: null, max: 25 },
  "25_40": { label: "₹25–40L", min: 25, max: 40 },
  "40_60": { label: "₹40–60L", min: 40, max: 60 },
  "60_85": { label: "₹60–85L", min: 60, max: 85 },
  "85_plus": { label: "₹85L+", min: 85, max: null },
};

export const DEFAULT_BUDGET_RANGE_KEYS = ["under_25", "25_40", "40_60", "60_85", "85_plus"];

export const DEFAULT_BUDGET_PRESETS: BudgetPreset[] = DEFAULT_BUDGET_RANGE_KEYS.map((key) => ({
  key,
  ...BUDGET_RANGE_DEFS[key],
}));

/** Turn the stored JSON key list into presets, falling back to the defaults. */
export function parseBudgetRanges(raw: string | null | undefined): BudgetPreset[] {
  if (!raw) return DEFAULT_BUDGET_PRESETS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_BUDGET_PRESETS;
    const presets = parsed
      .map((key) =>
        typeof key === "string" && BUDGET_RANGE_DEFS[key]
          ? { key, ...BUDGET_RANGE_DEFS[key] }
          : null
      )
      .filter((p): p is BudgetPreset => p != null);
    return presets.length ? presets : DEFAULT_BUDGET_PRESETS;
  } catch {
    return DEFAULT_BUDGET_PRESETS;
  }
}
