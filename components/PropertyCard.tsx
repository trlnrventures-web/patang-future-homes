import Link from "next/link";
import ProjectCover from "./ProjectCover";
import {
  carpetAreaRange,
  configurationLabel,
  type Project,
} from "@/lib/projects";
import { startingFrom } from "@/lib/price";

type PropertyCardProps = {
  project: Project;
  variant?: "default" | "expanded";
};

function priceLabel(project: Project): string {
  if (/^starting/i.test(project.priceRange)) {
    return `${startingFrom(project.priceRange)} onwards`;
  }
  return project.priceRange;
}

function badgeText(project: Project): string {
  const label = configurationLabel(project.configurations);
  const primary = /BHK/i.test(label)
    ? label
    : project.type === "shop"
      ? "Shops"
      : project.type === "bungalow"
        ? "Bungalow"
        : "Homes";
  const area = project.area === "west" ? "Vasai West" : "Vasai East";
  return `${primary} · ${area}`.toUpperCase();
}

function bedRange(project: Project): string | null {
  const nums = (configurationLabel(project.configurations).match(/\d+/g) || [])
    .map(Number)
    .sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const min = nums[0];
  const max = nums[nums.length - 1];
  return min === max ? `${min}` : `${min}–${max}`;
}

const MAP_PIN_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="h-3.5 w-3.5 shrink-0"
  >
    <path
      fillRule="evenodd"
      d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"
      clipRule="evenodd"
    />
  </svg>
);

export default function PropertyCard({
  project,
  variant = "default",
}: PropertyCardProps) {
  const beds = bedRange(project);
  const area = carpetAreaRange(project.configurations);
  const linkHref = `/projects/${project.slug}`;

  if (variant === "expanded") {
    return (
      <Link
        href={linkHref}
        className="group grid overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition hover:shadow-md sm:grid-cols-2"
      >
<div className="relative aspect-[4/3] sm:aspect-auto sm:h-full">
          <ProjectCover
            images={project.images}
            alt={`${project.title} in ${project.location}`}
            className="object-cover"
            sizes="(min-width: 640px) 50vw, 100vw"
          />
        </div>
        <div className="flex flex-col p-6">
          <h3 className="text-lg font-bold tracking-tight text-navy">
            {project.title}
          </h3>
          <p className="mt-1.5 flex items-start gap-1.5 text-sm text-muted">
            <span className="mt-0.5">{MAP_PIN_ICON}</span>
            {project.location}
          </p>
          <p className="mt-3 text-lg font-bold text-primary">
            {priceLabel(project)}
          </p>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <BedIcon />
              {beds ? `${beds} Beds` : "N/A"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BathIcon />
              {beds ? `${beds} Baths` : "N/A"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <AreaIcon />
              {area}
            </span>
          </div>

          <span className="mt-auto pt-5">
            <span className="inline-flex w-fit items-center justify-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors group-hover:bg-secondary">
              View Details →
            </span>
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={linkHref}
      className="group block overflow-hidden rounded-xl border border-border bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="relative aspect-[4/3]">
        <ProjectCover
          images={project.images}
          alt={`${project.title} in ${project.location}`}
          className="object-cover"
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
        {project.tier === "luxury" && (
          <span className="absolute right-3 top-3 z-10 rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            Luxury
          </span>
        )}
        <span className="absolute bottom-3 left-3 z-10 rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
          {badgeText(project)}
        </span>
      </div>
      <div className="p-5">
        <h3 className="font-bold tracking-tight text-navy">{project.title}</h3>
        <p className="mt-1.5 flex items-start gap-1.5 text-sm text-muted">
          <span className="mt-0.5">{MAP_PIN_ICON}</span>
          {project.location}
        </p>
        <p className="mt-3 font-bold text-primary">{priceLabel(project)}</p>
        <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-all group-hover:gap-2.5">
          View Property →
        </span>
      </div>
    </Link>
  );
}

function BedIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4 text-secondary"
    >
      <path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5a1 1 0 0 0-2 0v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z" />
    </svg>
  );
}

function BathIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4 text-secondary"
    >
      <path d="M21 7.5c0-1-1-2-2-2h-9V2h-1v4H3v15h6v1h6v-1h6v-6h2v-2h-2v-3a4 3 0 0 0-4-3h-1v1h1a3 3 0 0 1 3 3v3H7v-6h11a1 1 0 0 1 1 1h2z" />
    </svg>
  );
}

function AreaIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4 text-secondary"
    >
      <path d="M3 3v18h18V3H3zm8 8h6v6h-6V11zm4.5 2.5h1V16H14v-2.5zM15.5 6l1.4 1.4-2.4 2.4-1.4-1.4 2.4-2.4zm-7 2 1.4 1.4-2.4 2.4-1.4-1.4 2.4-2.4zM5 5h6v6H5V5z" />
    </svg>
  );
}