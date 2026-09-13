import rawProjects from "@/data/projects.json";

export type Configuration = {
  type: string;
  carpetArea: string;
  saleableArea?: string;
  price: string;
  allInclusive?: string;
  floorPlanImage: string;
};

export type AmenityImage = { title: string; src: string };

export type ShowFlatImage = {
  title: string;
  type: "actual" | "render";
  src: string;
};

export type Project = {
  slug: string;
  title: string;
  location: string;
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
  return configs[0]?.type ?? "—";
}

export function carpetAreaRange(configs: Configuration[]): string {
  const values: number[] = [];
  for (const c of configs) {
    const nums = (c.carpetArea.match(/\d{3,}(?:\.\d+)?/g) || []).map((s) =>
      parseFloat(s)
    );
    values.push(...nums);
  }
  if (values.length === 0) return "—";
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