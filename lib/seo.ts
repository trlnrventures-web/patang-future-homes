import {
  carpetAreaRange,
  configurationLabel,
  type Project,
} from "./projects";

export type ProjectMeta = {
  title: string;
  description: string;
};

function clampWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > max * 0.6 ? cut.slice(0, boundary) : cut).trimEnd()}\u2026`;
}

function place(project: Project): string {
  return [project.subLocation, project.location].filter(Boolean).join(", ");
}

export function projectConfigLabel(project: Project): string {
  return configurationLabel(project.configurations);
}

function priceClause(project: Project): string {
  return /request/i.test(project.priceRange)
    ? "on request"
    : `from ${project.priceRange}`;
}

function noun(project: Project): string {
  return project.type === "shop"
    ? "shops"
    : project.type === "bungalow"
      ? "bungalows"
      : "flats";
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Title + meta description for a project detail page, with keyword-rich fallbacks. */
export function projectMeta(project: Project): ProjectMeta {
  const label = projectConfigLabel(project);
  const base =
    project.type === "flat"
      ? `${project.title}, ${project.location} | ${label}`
      : `${project.title}, ${project.location}`;
  const title = project.metaTitle?.trim() || base;
  const description =
    project.metaDescription?.trim() ||
    clampWords(
      `${capitalizeFirst(noun(project))} in ${place(project)} ${priceClause(
        project
      )}. Check carpet area, floor plans, amenities and possession details, then book a free site visit with Patang Future Homes.`,
      160
    );
  return { title, description: clampWords(description, 160) };
}

/** Data-driven "About" paragraphs used when fullDescription is empty. */
export function projectAboutParagraphs(project: Project): string[] {
  const label = projectConfigLabel(project);
  const carpet = carpetAreaRange(project.configurations);
  const rera = project.reraId
    ? `, is MahaRERA registered (${project.reraId})`
    : "";
  const p1 = `${project.title} is a ${
    project.type === "shop" ? "commercial" : "residential"
  } project in ${place(project)} offering ${label} ${noun(
    project
  )} across ${project.configurations.length} configuration${
    project.configurations.length === 1 ? "" : "s"
  }, with carpet areas ranging from ${carpet}${rera}.`;

  const p2 = `Configurations include ${project.configurations
    .map(
      (c) =>
        `${c.type} (${c.carpetArea} carpet${c.price ? `, ${c.price}` : ""})`
    )
    .join("; ")}. Possession is expected by ${project.possessionDate}.`;

  const p3 = `${label} ${noun(project)} here are priced ${priceClause(
    project
  )}. The project sits in ${place(
    project
  )} with easy access to Vasai Road Railway Station, the Western Express Highway, reputed schools, hospitals and daily markets.`;

  return [p1, p2, p3];
}

/** USP cards used when the project has none. */
export function projectUsps(project: Project): {
  title: string;
  description: string;
}[] {
  const label = projectConfigLabel(project);
  const carpet = carpetAreaRange(project.configurations);
  return [
    {
      title: "Prime Location",
      description: `Set in ${place(
        project
      )} with quick access to Vasai Road station, the Western Express Highway and everyday essentials.`,
    },
    {
      title: "Smart Configurations",
      description: `Available in ${label}, sized ${carpet} in carpet area for comfortable city living.`,
    },
    {
      title: "Transparent Pricing",
      description: `Priced ${priceClause(
        project
      )}. Ask us for the full price list, floor plans and a site visit.`,
    },
  ];
}

/**
 * Minimum price in INR parsed from strings like "₹53.45 Lacs – ₹88.62 Lacs".
 * Returns null when no numeric price is available.
 */
export function minPriceINR(priceRange: string): number | null {
  const match = priceRange.match(/₹\s*([\d,.]+)\s*(lacs?|cr|crore|k)?/i);
  if (!match) return null;
  const value = parseFloat(match[1].replace(/,/g, ""));
  if (Number.isNaN(value)) return null;
  const unit = (match[2] || "").toLowerCase();
  if (unit.startsWith("l")) return Math.round(value * 100000);
  if (unit.startsWith("c")) return Math.round(value * 10000000);
  return Math.round(value);
}
