"use client";

import { useState } from "react";
import Link from "next/link";
import ProjectCover from "./ProjectCover";
import projects from "@/data/projects.json";
import { startingFrom } from "@/lib/price";

const TABS = [
  { value: "west", label: "Vasai West" },
  { value: "east", label: "Vasai East" },
] as const;

const CONFIGURATION_LINKS = [
  { label: "1 BHK Vasai West", href: "/vasai-west/1-bhk" },
  { label: "2 BHK Vasai West", href: "/vasai-west/2-bhk" },
  { label: "3 BHK Vasai West", href: "/vasai-west/3-bhk" },
  { label: "1 BHK Vasai East", href: "/vasai-east/1-bhk" },
  { label: "2 BHK Vasai East", href: "/vasai-east/2-bhk" },
  { label: "3 BHK Vasai East", href: "/vasai-east/3-bhk" },
];

export default function NewProjects() {
  const [active, setActive] = useState<"west" | "east">("west");

  const visible = projects.filter((p) => p.area === active);

  return (
    <section className="bg-background py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
              Exclusive listings
            </div>
            <h2 className="mt-2 font-bold text-ink text-2xl sm:text-3xl">
              New Projects in Vasai West &amp; Vasai East
            </h2>
            <p className="mt-2 text-sm text-muted">
              Freshly launched and under-construction developments across Vasai.
            </p>
          </div>

          {/* Tab toggle */}
          <div
            className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-white p-1 shadow-sm"
            role="tablist"
            aria-label="Location filter"
          >
            {TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active === tab.value}
                onClick={() => setActive(tab.value)}
                className={`relative rounded-full px-5 py-1.5 text-sm font-semibold transition-colors ${
                  active === tab.value
                    ? "text-white"
                    : "text-muted hover:text-ink"
                }`}
              >
                {active === tab.value && (
                  <span className="absolute inset-0 rounded-full bg-primary" />
                )}
                <span className="relative">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Horizontal scroll row */}
        <div className="mt-10 -mx-5 overflow-x-auto px-5 pb-2 lg:-mx-8 lg:px-8">
          <div className="flex gap-5">
            {visible.map((project) => (
              <Link
                key={project.slug}
                href={`/projects/${project.slug}`}
                className="group w-[280px] shrink-0 overflow-hidden rounded-2xl bg-white shadow-md transition-shadow hover:shadow-xl sm:w-[320px]"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <ProjectCover
                    images={project.images}
                    alt={`${project.title} in ${project.location}`}
                    className="object-cover transition-transform duration-400 ease-out group-hover:scale-[1.04]"
                    sizes="320px"
                  />

                  {/* Status badge */}
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

                <div className="p-4">
                  <h3 className="font-bold text-ink">
                    {project.title}
                  </h3>
                  <p className="mt-1 text-xs text-soft">{project.location}</p>
                  <p className="mt-2.5 text-sm font-bold text-primary">
                    Starting from {startingFrom(project.priceRange)}
                  </p>
                  <span className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-accent-ink transition-colors group-hover:gap-2">
                    View Details
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-3.5 w-3.5"
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
        </div>

        {visible.length === 0 && (
          <p className="mt-8 text-center text-sm text-soft">
            No projects listed in this area yet.
          </p>
        )}

        {/* Browse by configuration */}
        <div className="mt-12 border-t border-ink/10 pt-8">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
            Browse by Configuration
          </h3>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {CONFIGURATION_LINKS.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}