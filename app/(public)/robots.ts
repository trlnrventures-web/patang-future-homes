import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: ["/api/", "/crm/admin", "/_next/"],
        allow: ["/", "/crm/"],
      },
    ],
    sitemap: "https://patangfuturehomes.com/sitemap.xml",
  };
}
