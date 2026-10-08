/**
 * Public-site status badges.
 *
 * `status` doubles as a publish flag ("draft" | "published"), so rendering it
 * verbatim leaks internal words like "PUBLISHED" onto the site. Only real
 * marketing statuses get a badge; everything else returns null.
 */
export type StatusBadgeSurface = "image" | "dark" | "soft" | "light";

export type StatusBadge = { label: string; className: string } | null;

const SURFACE_CLASSES: Record<StatusBadgeSurface, string> = {
  image: "bg-ink/80 text-white backdrop-blur-sm",
  dark: "bg-white/10 text-white",
  soft: "bg-white/90 text-ink",
  light: "bg-primary text-white",
};

export function statusBadge(
  status: string,
  surface: StatusBadgeSurface = "image"
): StatusBadge {
  if (status === "New Launch") {
    return { label: status, className: "bg-accent text-primary" };
  }
  if (status === "Under Construction") {
    return { label: status, className: SURFACE_CLASSES[surface] };
  }
  return null;
}
