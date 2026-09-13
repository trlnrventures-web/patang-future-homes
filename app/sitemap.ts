import projects from "@/data/projects.json";
import seoLandingPages from "@/data/seo-landing-pages.json";

const BASE = "https://patangfuturehomes.com";

export default function sitemap() {
  const staticPages = [
    { url: BASE, lastModified: new Date() },
    { url: `${BASE}/projects`, lastModified: new Date() },
    { url: `${BASE}/about`, lastModified: new Date() },
    { url: `${BASE}/contact`, lastModified: new Date() },
  ];

  const projectPages = projects.map((p) => ({
    url: `${BASE}/projects/${p.slug}`,
    lastModified: new Date(),
  }));

  const landingPages = seoLandingPages.map(
    (p: { locationSlug: string; bhkSlug: string }) => ({
      url: `${BASE}/${p.locationSlug}/${p.bhkSlug}`,
      lastModified: new Date(),
    })
  );

  return [...staticPages, ...projectPages, ...landingPages];
}
