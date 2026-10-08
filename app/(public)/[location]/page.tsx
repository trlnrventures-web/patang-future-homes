import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import seoLandingPages from "@/data/seo-landing-pages.json";
import { projects } from "@/lib/projects";
import { minPriceINR } from "@/lib/seo";
import { absoluteUrl, jsonLd } from "@/lib/json-ld";
import PropertyCard from "@/components/PropertyCard";

const AREA_LABELS: Record<string, string> = {
  "vasai-west": "Vasai West",
  "vasai-east": "Vasai East",
};

const AREA_COPY: Record<string, { h1: string; intro: string }> = {
  "vasai-west": {
    h1: "Flats in Vasai West — Price List & Projects",
    intro:
      "Vasai West is the most searched property market of the region, spread across localities like Om Nagar, Agarwal, Suncity, Yashwant County and Rajhans Dreams. It is well connected via Vasai Road railway station and the Western Express Highway, and offers 1, 2 and 3 BHK flats across every budget — from affordable new launches to premium sea-facing homes. Compare live projects, price lists and configurations below before you book a free site visit.",
  },
  "vasai-east": {
    h1: "Flats in Vasai East — Price List & Projects",
    intro:
      "Vasai East is the fast-growing, budget-friendly side of the market, with residential clusters around Manickpur Naka and Rajendra Nagar. Connected by the Eastern Express Highway and Vasai Road station, it offers larger carpet areas at lower price points than the west. Compare available 1, 2 and 3 BHK homes below and book a free site visit with Patang Future Homes.",
  },
};

export function generateStaticParams() {
  return Object.keys(AREA_LABELS).map((location) => ({ location }));
}

type Props = { params: Promise<{ location: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { location } = await params;
  const areaLabel = AREA_LABELS[location];
  if (!areaLabel) return { title: "Location Not Found" };

  const count = projects.filter(
    (p) => location === "vasai-west" ? p.area === "west" : p.area === "east"
  ).length;
  const description =
    count > 0
      ? `Buy flats in ${areaLabel}: compare ${count} projects with 1, 2 & 3 BHK price lists, carpet areas and possession details. Book a free site visit with Patang Future Homes.`
      : `Looking for flats in ${areaLabel}? Explore 1, 2 & 3 BHK options, price trends and upcoming projects, then book a free site visit with Patang Future Homes.`;

  return {
    title: `Flats in ${areaLabel} | Price List`,
    description,
    keywords: [
      `flats in ${areaLabel}`,
      `property for sale in ${areaLabel}`,
      `new projects in ${areaLabel}`,
      `${areaLabel} price list`,
    ],
    alternates: {
      canonical: `/${location}`,
    },
    openGraph: {
      type: "website",
      title: `Flats in ${areaLabel} | Price List`,
      description,
      url: `/${location}`,
      siteName: "Patang Future Homes",
      locale: "en_IN",
      images: [
        {
          url: "/brand/og-image.png",
          width: 1200,
          height: 630,
          alt: `Patang Future Homes, properties in ${areaLabel}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `Flats in ${areaLabel} | Price List`,
      description,
      images: ["/brand/og-image.png"],
    },
  };
}

function subLocationCounts(area: "west" | "east") {
  const counts = new Map<string, number>();
  for (const p of projects) {
    if (p.area !== area || !p.subLocation) continue;
    counts.set(p.subLocation, (counts.get(p.subLocation) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export default async function LocationHub({ params }: Props) {
  const { location } = await params;
  const areaLabel = AREA_LABELS[location];
  const copy = AREA_COPY[location];
  if (!areaLabel || !copy) notFound();

  const area = location === "vasai-west" ? "west" : "east";
  const areaProjects = projects.filter((p) => p.area === area);
  const shown = areaProjects.slice(0, 9);
  const bhkPages = seoLandingPages.filter(
    (p: { locationSlug: string }) => p.locationSlug === location
  );

  const prices = areaProjects
    .map((p) => minPriceINR(p.priceRange))
    .filter((n): n is number => n !== null);
  const lowest = prices.length > 0 ? Math.min(...prices) : null;
  const subs = subLocationCounts(area);

  const jsonLdData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: absoluteUrl("/"),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: areaLabel,
            item: absoluteUrl(`/${location}`),
          },
        ],
      },
      ...(shown.length > 0
        ? [
            {
              "@type": "ItemList",
              name: `Projects in ${areaLabel}`,
              itemListElement: shown.map((p, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: p.title,
                url: absoluteUrl(`/projects/${p.slug}`),
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(jsonLdData)}
      />

      <section className="bg-lavender pt-28 pb-12 lg:pt-36 lg:pb-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-x-2 text-xs text-soft"
          >
            <Link href="/" className="transition-colors hover:text-accent-ink">
              Home
            </Link>
            <span>/</span>
            <span className="font-medium text-muted">{areaLabel}</span>
          </nav>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            {copy.h1}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
            {copy.intro}
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            {bhkPages.map((p: { bhkSlug: string; h1Heading: string }) => (
              <Link
                key={p.bhkSlug}
                href={`/${location}/${p.bhkSlug}`}
                className="rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
              >
                {p.h1Heading}
              </Link>
            ))}
            <Link
              href={`/projects?area=${area}`}
              className="rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-primary hover:text-primary"
            >
              All Projects in {areaLabel}
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8 lg:py-16">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-ink/10 bg-background p-5">
              <div className="text-3xl font-bold text-primary">
                {areaProjects.length}
              </div>
              <div className="mt-1 text-sm text-muted">
                Projects listed in {areaLabel}
              </div>
            </div>
            <div className="rounded-2xl border border-ink/10 bg-background p-5">
              <div className="text-3xl font-bold text-primary">
                {lowest !== null
                  ? `₹${(lowest / 100000).toFixed(1)} Lacs`
                  : "On request"}
              </div>
              <div className="mt-1 text-sm text-muted">
                Lowest available price
              </div>
            </div>
            <div className="rounded-2xl border border-ink/10 bg-background p-5">
              <div className="text-3xl font-bold text-primary">
                {subs.length}
              </div>
              <div className="mt-1 text-sm text-muted">
                Localities covered
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
                Live inventory
              </div>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-navy sm:text-3xl">
                Projects in {areaLabel}
              </h2>
            </div>
            <Link
              href="/properties"
              className="rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
            >
              Browse all properties
            </Link>
          </div>

          {shown.length > 0 ? (
            <>
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((project) => (
                  <PropertyCard key={project.slug} project={project} />
                ))}
              </div>
              {areaProjects.length > shown.length && (
                <div className="mt-8 text-center">
                  <Link
                    href={`/projects?area=${area}`}
                    className="inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-secondary"
                  >
                    View all {areaProjects.length} projects in {areaLabel}
                  </Link>
                </div>
              )}
            </>
          ) : (
            <div className="mt-8 rounded-2xl border border-dashed border-border bg-background px-6 py-12 text-center">
              <p className="font-bold text-navy">
                New listings in {areaLabel} are on the way
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                We add projects regularly. Browse everything currently
                available, or talk to us about upcoming launches.
              </p>
              <Link
                href="/properties"
                className="mt-6 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-secondary"
              >
                Browse All Properties
              </Link>
            </div>
          )}
        </div>
      </section>

      {subs.length > 0 && (
        <section className="bg-background">
          <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8 lg:py-16">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
              Locality guide
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-navy sm:text-3xl">
              Popular localities in {areaLabel}
            </h2>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {subs.map(([name, count]) => (
                <span
                  key={name}
                  className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-muted"
                >
                  {name}{" "}
                  <span className="font-semibold text-ink">({count})</span>
                </span>
              ))}
            </div>
            <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted">
              {"Prefer a specific configuration? Jump to our "}
              {bhkPages.map(
                (
                  p: { bhkSlug: string; h1Heading: string },
                  i: number,
                  all: { bhkSlug: string; h1Heading: string }[]
                ) => (
                  <Fragment key={p.bhkSlug}>
                    {i > 0 ? (i === all.length - 1 ? " or " : ", ") : ""}
                    <Link
                      href={`/${location}/${p.bhkSlug}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {p.h1Heading.toLowerCase()}
                    </Link>
                  </Fragment>
                )
              )}
              {" pages for price lists, carpet areas and FAQs."}
            </p>
          </div>
        </section>
      )}
    </>
  );
}
