"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import projects from "@/data/projects.json";
import { startingFrom } from "@/lib/price";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "shop", label: "Shops" },
  { value: "flat", label: "Flats" },
  { value: "bungalow", label: "Bungalows" },
] as const;

export default function ProjectGrid() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initial = searchParams.get("type") ?? "all";
  const areaParam = searchParams.get("area");
  const [active, setActive] = useState(initial);

  const filtered = projects.filter((project) => {
    const matchesType = active === "all" || project.type === active;
    const matchesArea =
      !areaParam || areaParam === "both" || project.area === areaParam;
    return matchesType && matchesArea;
  });

  function handleFilter(value: string) {
    setActive(value);
    const params = new URLSearchParams();
    if (value !== "all") params.set("type", value);
    if (areaParam && areaParam !== "both") params.set("area", areaParam);
    const qs = params.toString();
    router.replace(`/projects${qs ? `?${qs}` : ""}`);
  }

  return (
    <>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => handleFilter(f.value)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
              active === f.value
                ? "bg-primary text-white shadow-md shadow-primary/20"
                : "bg-ink/5 text-muted hover:bg-ink/10 hover:text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
        {areaParam && areaParam !== "both" && (
          <span className="ml-2 inline-flex items-center rounded-full border border-accent-ink/25 bg-accent-ink/10 px-3 py-1 text-xs font-semibold text-accent-ink">
            {(areaParam === "west" ? "Vasai West" : "Vasai East")}
          </span>
        )}
      </div>

      {/* Grid */}
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((project) => (
          <Link
            key={project.slug}
            href={`/projects/${project.slug}`}
            className="group block overflow-hidden rounded-2xl bg-white shadow-sm transition-shadow hover:shadow-xl"
          >
            <div className="relative aspect-[16/10] overflow-hidden">
              <Image
                src={project.images[0]}
                alt={project.title}
                fill
                className="object-cover transition-transform duration-400 ease-out group-hover:scale-[1.04]"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
              <span
                className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                  project.status === "New Launch"
                    ? "bg-accent text-primary"
                    : "bg-ink/80 text-white backdrop-blur-sm"
                }`}
              >
                {project.status}
              </span>
            </div>

            <div className="p-5">
              <h3 className="font-bold text-ink">
                {project.title}
              </h3>

              <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-3.5 w-3.5 shrink-0 text-soft"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"
                    clipRule="evenodd"
                  />
                </svg>
                {project.location}
              </div>

              <p className="mt-3 text-sm font-bold text-primary">
                Starting {startingFrom(project.priceRange)}
              </p>

              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent-ink transition-all group-hover:gap-2">
                View Details
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-12 text-center text-sm text-soft">
          No projects found in this category.
        </p>
      )}
    </>
  );
}