import type { Metadata } from "next";
import { Suspense } from "react";
import ProjectGrid from "@/components/ProjectGrid";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Browse premium shops, flats, and bungalows in Vasai West by Patang Future Homes. Find your ideal property today.",
  keywords: [
    "new projects in Vasai West",
    "under construction projects Vasai East",
    "shops flats and bungalows Vasai",
    "RERA registered projects Vasai",
  ],
  alternates: {
    canonical: "/projects",
  },
  openGraph: {
    type: "website",
    title: "Projects",
    description:
      "Explore premium shops, flats and bungalows in Vasai West & Vasai East listed by Patang Future Homes.",
    url: "/projects",
    images: [
      {
        url: "/og-image.jpg",
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
          Our Projects
        </h1>
        <p className="mt-2 max-w-lg text-sm text-muted">
          Explore our curated selection of properties in Vasai West.
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
