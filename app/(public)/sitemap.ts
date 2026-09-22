import type { MetadataRoute } from "next";
import { projects } from "@/lib/projects";
import seoLandingPages from "@/data/seo-landing-pages.json";

const BASE = "https://patangfuturehomes.com";
const LAST_MODIFIED = new Date("2026-09-13");

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: LAST_MODIFIED },
    { url: `${BASE}/properties`, lastModified: LAST_MODIFIED },
    { url: `${BASE}/projects`, lastModified: LAST_MODIFIED },
    { url: `${BASE}/about`, lastModified: LAST_MODIFIED },
    { url: `${BASE}/contact`, lastModified: LAST_MODIFIED },
    { url: `${BASE}/emi-calculator`, lastModified: LAST_MODIFIED },
    { url: `${BASE}/home-loan-calculator`, lastModified: LAST_MODIFIED },
    { url: `${BASE}/rent-vs-buy-calculator`, lastModified: LAST_MODIFIED },
    { url: `${BASE}/roi-calculator`, lastModified: LAST_MODIFIED },
    { url: `${BASE}/stamp-duty-calculator`, lastModified: LAST_MODIFIED },
  ];

  const projectPages: MetadataRoute.Sitemap = projects.map((p) => ({
    url: `${BASE}/projects/${p.slug}`,
    lastModified: LAST_MODIFIED,
  }));

  const landingPages: MetadataRoute.Sitemap = seoLandingPages.map(
    (p: { locationSlug: string; bhkSlug: string }) => ({
      url: `${BASE}/${p.locationSlug}/${p.bhkSlug}`,
      lastModified: LAST_MODIFIED,
    })
  );

  return [...staticPages, ...projectPages, ...landingPages];
}