import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import ProjectGrid from "@/components/ProjectGrid";
import { projects } from "@/lib/projects";

const DESCRIPTION = `Browse ${projects.length} projects in Vasai West: 1, 2 & 3 BHK flats with price lists, carpet areas, possession dates and RERA details. Compare shops & bungalows too.`;

export const metadata: Metadata = {
  title: "New Projects in Vasai West & East",
  description: DESCRIPTION,
  keywords: [
    "new projects in Vasai West",
    "under construction projects Vasai West",
    "RERA registered projects Vasai",
    "flats in Vasai West with price list",
  ],
  alternates: {
    canonical: "/projects",
  },
  openGraph: {
    type: "website",
    title: "New Projects in Vasai West & East",
    description: DESCRIPTION,
    url: "/projects",
    images: [
      {
        url: "/brand/og-image.png",
        width: 1200,
        height: 630,
        alt: "Patang Future Homes projects in Vasai",
      },
    ],
  },
};

export default function ProjectsPage() {
  return (
    <section className="bg-background pt-28 pb-16 lg:pt-36 lg:pb-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
          Browse listings
        </div>
        <h1 className="mt-2 font-bold text-ink text-3xl sm:text-4xl">
          New Projects in Vasai West &amp; East
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
          Explore every project we list across{" "}
          <Link
            href="/vasai-west"
            className="font-medium text-primary hover:underline"
          >
            Vasai West
          </Link>
          {" and "}
          <Link
            href="/vasai-east"
            className="font-medium text-primary hover:underline"
          >
            Vasai East
          </Link>
          {" — from affordable 1 BHK flats to spacious 3 BHK homes, shops and bungalows. Filter by type, configuration and area, then open any project for its price list, carpet areas, floor plans and possession timeline. Prefer a guided shortlist? "}
          <Link
            href="/contact"
            className="font-medium text-primary hover:underline"
          >
            Talk to our Vasai property advisors
          </Link>
          .
        </p>

        <div className="mt-10">
          <Suspense>
            <ProjectGrid />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
