import rawProjects from "@/data/projects.json";

export type Configuration = {
  type: string;
  carpetArea: string;
  saleableArea?: string;
  price: string;
  allInclusive?: string;
  floorBreakup?: { floors: string; price: string }[];
  floorPlanImage: string;
};

export type AmenityImage = { title: string; src: string };

export type ShowFlatImage = {
  title: string;
  type: "actual" | "render";
  src: string;
};

export const SUB_LOCATIONS = [
  "Sai Nagar",
  "Navyug Nagar",
  "Diwanman",
  "Gokul Aagan",
  "Krishna Township",
  "Bhabola",
  "Stella",
  "Barampur",
  "Shastri Nagar",
  "Anand Nagar",
  "Manickpur",
  "Ambadi Road",
  "Om Nagar",
  "Navpada",
  "Suncity",
  "Navghar",
  "Papdi",
  "Koliwada",
  "Chulna",
  "Kaul Heritage City",
  "Golani Naka",
  "Suruchi Beach",
  "Umela",
  "Fatherwadi",
] as const;

export function subLocationTokens(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[\/,&]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function subLocationMatches(projectValue?: string | null, leadValue?: string | null): boolean {
  const pTokens = subLocationTokens(projectValue);
  if (pTokens.length === 0 || !leadValue) return false;
  const lTokens = subLocationTokens(leadValue);
  const norm = (s: string) => s.toLowerCase().trim();
  return pTokens.some((pt) => lTokens.some((lt) => norm(pt) === norm(lt)));
}

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
};

export const projects: Project[] = rawProjects as Project[];

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