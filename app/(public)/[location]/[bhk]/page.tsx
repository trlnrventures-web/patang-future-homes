import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import seoLandingPages from "@/data/seo-landing-pages.json";
import { projects } from "@/lib/projects";
import PropertyCard from "@/components/PropertyCard";

type SeoLandingPage = {
  locationSlug: string;
  bhkSlug: string;
  metaTitle: string;
  metaDescription: string;
  h1Heading: string;
  introParagraph: string;
  faqs: { question: string; answer: string }[];
};

const pages = seoLandingPages as SeoLandingPage[];

const AREA_LABELS: Record<string, string> = {
  "vasai-west": "Vasai West",
  "vasai-east": "Vasai East",
};

function areaFromSlug(slug: string): "west" | "east" | null {
  if (slug === "vasai-west") return "west";
  if (slug === "vasai-east") return "east";
  return null;
}

function bhkNumberFromSlug(slug: string): number | null {
  const match = slug.match(/^(\d+)-bhk$/);
  return match ? parseInt(match[1], 10) : null;
}

function matchingProjects(locationSlug: string, bhk: number) {
  const area = areaFromSlug(locationSlug);
  if (!area) return [];
  return projects.filter(
    (p) =>
      p.area === area &&
      p.configurations.some((c) =>
        new RegExp(`^${bhk}\\s*BHK`, "i").test(c.type)
      )
  );
}

export function generateStaticParams() {
  return pages.map((p) => ({
    location: p.locationSlug,
    bhk: p.bhkSlug,
  }));
}

type Props = { params: Promise<{ location: string; bhk: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { location, bhk } = await params;
  const page = pages.find(
    (p) => p.locationSlug === location && p.bhkSlug === bhk
  );

  if (!page) return { title: "Properties Not Found" };

  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: {
      canonical: `/${location}/${bhk}`,
    },
    openGraph: {
      type: "website",
      title: page.metaTitle,
      description: page.metaDescription,
      url: `/${location}/${bhk}`,
      siteName: "Patang Future Homes",
      locale: "en_IN",
      images: [
        {
          url: "/og-image.jpg",
          width: 1200,
          height: 630,
          alt: "Patang Future Homes",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: page.metaTitle,
      description: page.metaDescription,
      images: ["/og-image.jpg"],
    },
  };
}

export default async function BhkLandingPage({ params }: Props) {
  const { location, bhk } = await params;
  const page = pages.find(
    (p) => p.locationSlug === location && p.bhkSlug === bhk
  );

  if (!page) notFound();

  const bhkNumber = bhkNumberFromSlug(bhk);
  const bhkLabel = bhkNumber ? `${bhkNumber} BHK` : "Properties";
  const areaLabel = AREA_LABELS[location] ?? "Vasai";
  const matching = matchingProjects(location, bhkNumber ?? 0);
  const filterHref = `/properties?type=flat&area=${areaFromSlug(location)}&config=${
    bhkNumber ?? ""
  }`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: page.faqs.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: "https://patangfuturehomes.com/",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: areaLabel,
            item: `https://patangfuturehomes.com/projects?area=${areaFromSlug(
              location
            )}`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: page.h1Heading,
            item: `https://patangfuturehomes.com/${location}/${bhk}`,
          },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Header */}
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
            <Link
              href={`/projects?area=${areaFromSlug(location)}`}
              className="transition-colors hover:text-accent-ink"
            >
              {areaLabel}
            </Link>
            <span>/</span>
            <span className="font-medium text-muted">{bhkLabel}</span>
          </nav>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            {page.h1Heading}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted">
            {page.introParagraph}
          </p>
        </div>
      </section>

      {/* Matching projects */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">
                {bhkLabel} Projects in {areaLabel}
              </h2>
              <p className="mt-2 text-sm text-muted">
                New and under-construction {bhkLabel.toLowerCase()} homes
                currently listed with us.
              </p>
            </div>
            <Link
              href={filterHref}
              className="rounded-full border border-primary px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
            >
              View all in {areaLabel}
            </Link>
          </div>

          {matching.length > 0 ? (
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {matching.map((project) => (
                <PropertyCard key={project.slug} project={project} />
              ))}
            </div>
          ) : (
            <div className="mt-8 rounded-2xl border border-dashed border-border bg-background px-6 py-12 text-center">
              <p className="font-bold text-navy">
                No {bhkLabel.toLowerCase()} projects listed here yet
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                New listings in {areaLabel} are added regularly. Check back soon
                or browse all available properties.
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

      {/* FAQ */}
      <section className="bg-background">
        <div className="mx-auto max-w-3xl px-5 py-16 lg:px-8 lg:py-20">
          <h2 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">
            Frequently Asked Questions
          </h2>
          <div className="mt-8 space-y-4">
            {page.faqs.map((f) => (
              <details
                key={f.question}
                className="group rounded-2xl border border-border bg-white p-6"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-ink">
                  {f.question}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5 shrink-0 text-primary transition-transform group-open:rotate-180"
                  >
                    <path d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1z" />
                  </svg>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {f.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}