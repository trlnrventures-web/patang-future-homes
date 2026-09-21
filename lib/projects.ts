import rawProjects from "@/data/projects.json";

export type Configuration = {
  type: string;
  carpetArea: string;
  saleableArea?: string;
  price: string;
  allInclusive?: boolean;
  parkingIncluded?: boolean;
  amenities?: string[];
  floorBreakup?: { floors: string; price: string }[];
  floorPlanImage: string;
};

export type AmenityImage = { title: string; src: string };

export type ShowFlatImage = {
  title: string;
  type: "actual" | "render";
  src: string;
};

export { SUB_LOCATIONS, subLocationTokens, subLocationMatches } from "./sub-locations";

export type PriceValidityInfo = {
  validUntil: string;
  daysLeft: number;
  expired: boolean;
  label: string;
};

export function priceValidityInfo(project: { priceValidUntil?: string }): PriceValidityInfo | null {
  if (!project.priceValidUntil) return null;
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const end = new Date(`${project.priceValidUntil}T23:59:59+05:30`).getTime();
  const now = new Date().getTime(); // server time; IST shift handled below
  const nowIst = now + IST_OFFSET_MS;
  const daysLeft = Math.round((end - nowIst) / (24 * 60 * 60 * 1000));
  const expired = daysLeft < 0;
  const fmt = new Date(project.priceValidUntil).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "IST",
  });
  if (expired || daysLeft > 14) return null;
  const label =
    daysLeft === 0
      ? `⏰ Price valid till today (${fmt})`
      : `⏰ Price valid till ${fmt} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
  return { validUntil: project.priceValidUntil, daysLeft, expired, label };
}

export type Project = {
  slug: string;
  title: string;
  category?: "primary" | "resale";
  location: string;
  subLocation?: string;
  priceValidUntil?: string;
  area: "west" | "east";
  type: "shop" | "flat" | "bungalow";
  status: "New Launch" | "Under Construction";
  tier?: "affordable" | "luxury";
  priceRange: string;
  pricePerSqft: string;
  shortDescription: string;
  description?: string;
  fullDescription: string;
  usps: { title: string; description: string }[];
  images: string[];
  reraId: string;
  possessionDate: string;
  totalTowers: number;
  landParcel: string;
  configurations: Configuration[];
  amenities: {
    convenience: string[];
    safety: string[];
    sports: string[];
    leisure: string[];
  };
  showFlatVideoUrl: string;
  walkthroughVideoUrl: string;
  amenityImages?: AmenityImage[];
  showFlatImages?: ShowFlatImage[];
  nearbyLandmarks: { name: string; distance: string }[];
  developer: {
    name: string;
    since: number;
    completedProjects: string;
  };
  metaTitle: string;
  metaDescription: string;
  isActive?: boolean;
};

export const projects: Project[] = (rawProjects as Project[]).filter(
  (p) => p.isActive !== false
);

export function getProject(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export function configurationLabel(configs: Configuration[]): string {
  const bhkTypes = configs
    .map((c) => c.type)
    .filter((t) => /^\d+\s*BHK/i.test(t));
  if (bhkTypes.length > 0 && bhkTypes.length === configs.length) {
    const nums = bhkTypes
      .map((t) => parseInt(t, 10))
      .sort((a, b) => a - b);
    return `${nums.join(", ")} BHK`;
  }
  return configs[0]?.type ?? "N/A";
}

export function carpetAreaRange(configs: Configuration[]): string {
  const values: number[] = [];
  for (const c of configs) {
    const nums = (c.carpetArea.match(/\d{3,}(?:\.\d+)?/g) || []).map((s) =>
      parseFloat(s)
    );
    values.push(...nums);
  }
  if (values.length === 0) return "N/A";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? `${min} sq ft` : `${min} – ${max} sq ft`;
}

export function toParagraphs(text: string, count = 3): string[] {
  const sentences =
    (text.match(/[^.!?]+[.!?]+(?:["'])?|.+$/g) || [text])
      .map((s) => s.trim())
      .filter(Boolean);
  const per = Math.ceil(sentences.length / count);
  const groups: string[] = [];
  for (let i = 0; i < sentences.length; i += per) {
    groups.push(sentences.slice(i, i + per).join(" "));
  }
  return groups.length ? groups : [text];
}

export function developerYears(since: number): string {
  const years = new Date().getFullYear() - since;
  return `${years}+ years`;
}