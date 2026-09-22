import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  projects,
  getProject,
  configurationLabel,
  toParagraphs,
  developerYears,
  type Project,
} from "@/lib/projects";
import { startingFrom } from "@/lib/price";
import { categorizeAmenities, type AmenityCategory } from "@/lib/amenities";
import ImageCarousel from "@/components/ImageCarousel";
import ProjectCover from "@/components/ProjectCover";
import VideoEmbed from "@/components/VideoEmbed";
import ConfigPriceCard from "@/components/ConfigPriceCard";
import GalleryGrid from "@/components/GalleryGrid";
import AmenityShowcase from "@/components/AmenityShowcase";
import ShowFlatGallery from "@/components/ShowFlatGallery";
import HorizontalScroll from "@/components/HorizontalScroll";

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();
  const heroImage = project.images[0];

  return {
    title: { absolute: project.metaTitle },
    description: project.metaDescription,
    alternates: {
      canonical: `/projects/${project.slug}`,
    },
    openGraph: {
      title: project.metaTitle,
      description: project.metaDescription,
      url: `/projects/${project.slug}`,
      siteName: "Patang Future Homes",
      type: "website",
      locale: "en_IN",
      images: heroImage
        ? [
            {
              url: heroImage,
              width: 1200,
              height: 630,
              alt: project.title,
            },
          ]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title: project.metaTitle,
      description: project.metaDescription,
      images: heroImage ? [heroImage] : [],
    },
  };
}

const WHATSAPP_NUMBER = "917249138197";

function enquireUrl(project: Project) {
  const text = encodeURIComponent(
    `Hi, I'd like to know more about ${project.title}. Please share the price list, floor plans and site visit availability.`
  );
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
}

const WHATSAPP_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="h-4 w-4"
  >
    <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
  </svg>
);

const PHONE_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="h-4 w-4"
  >
    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
  </svg>
);

function statusBadgeClass(status: string, surface: "image" | "dark" | "light") {
  if (status === "New Launch") return "bg-accent text-primary";
  if (surface === "image") return "bg-background/90 text-primary";
  return "bg-white/10 text-white";
}

function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow?: string;
  title: string;
}) {
  return (
    <div>
      {eyebrow && (
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
          {eyebrow}
        </div>
      )}
      <h2 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">
        {title}
      </h2>
    </div>
  );
}

const MAP_PIN_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-4 w-4"
  >
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const USP_ICONS = [
  (
    <svg
      key="view"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <path d="M22 10s-9.75-3.5-20-2c0 6 4 10 10 10s10-4 10-8Z" />
      <path d="M22 10c-.2 2.4-2 6-4.5 7.7" />
    </svg>
  ),
  (
    <svg
      key="template"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  ),
  (
    <svg
      key="shield"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
];

const AMENITY_CATEGORIES: {
  key: AmenityCategory;
  label: string;
  icon: ReactNode;
}[] = [
  {
    key: "convenience",
    label: "Convenience",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    key: "safety",
    label: "Safety",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    key: "sports",
    label: "Sports & Fitness",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <path d="M14.4 14.4 9.6 9.6" />
        <path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l1.768-1.768a2 2 0 1 1 2.828 2.829z" />
        <path d="m21.5 21.5-1.4-1.4" />
        <path d="M3.9 3.9 2.5 2.5" />
        <path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z" />
      </svg>
    ),
  },
  {
    key: "leisure",
    label: "Leisure & Lifestyle",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.9 4.9 1.4 1.4" />
        <path d="m17.7 17.7 1.4 1.4" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m4.9 19.1 1.4-1.4" />
        <path d="m17.7 6.3 1.4-1.4" />
      </svg>
    ),
  },
];

const CHECK_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="h-4 w-4 shrink-0 text-accent-ink"
  >
    <path
      fillRule="evenodd"
      d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25z"
      clipRule="evenodd"
    />
  </svg>
);

export default async function ProjectDetail({ params }: Props) {
  const { slug } = await params;
  const project = getProject(slug);

  if (!project) {
    notFound();
  }

  const startingPrice = startingFrom(project.priceRange);
  const categorizedAmenities = categorizeAmenities(project.amenities);
  const aboutParagraphs = toParagraphs(project.fullDescription);
  const aboutDescription = project.description ?? aboutParagraphs[0];
  const quickFacts = [
    {
      label: "Configuration",
      value: configurationLabel(project.configurations),
    },
    {
      label: "Possession",
      value: project.possessionDate.split(/[,|(]/)[0].trim(),
    },
    { label: "Price per sq ft", value: project.pricePerSqft },
    { label: "RERA ID", value: project.reraId },
    {
      label: "Project Type",
      value:
        project.type === "shop"
          ? "Commercial"
          : project.type === "bungalow"
            ? "Residential Bungalow"
            : "Residential",
    },
    { label: "Total Towers", value: String(project.totalTowers) },
    { label: "Land Parcel", value: project.landParcel },
  ];
  const related = projects
    .filter((p) => p.slug !== project.slug)
    .slice(0, 5);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: project.title,
    description: project.fullDescription,
    url: `https://patangfuturehomes.com/projects/${project.slug}`,
    image: project.images,
    address: {
      "@type": "PostalAddress",
      addressLocality: project.location,
      addressRegion: "Maharashtra",
      addressCountry: "IN",
    },
    offers: {
      "@type": "Offer",
      price: project.priceRange,
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="bg-background">
        <div className="mx-auto max-w-7xl px-5 pt-28 pb-16 lg:px-8 lg:pt-32 lg:pb-24">
          {/* ================= 1. HERO ROW: GALLERY | PRICE/CTA (65/35) ================= */}
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] lg:gap-8">
            <div className="min-w-0">
              <ImageCarousel
                images={project.images}
                title={project.title}
                location={project.location}
                status={project.status}
              />
            </div>

            <aside className="lg:sticky lg:top-24">
              <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-lg shadow-ink/5">
                <div className="bg-primary px-6 py-5">
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusBadgeClass(
                        project.status,
                        "dark"
                      )}`}
                    >
                      {project.status}
                    </span>
                    <span className="text-xs text-white/60">
                      RERA Registered
                    </span>
                  </div>
                  <p className="mt-5 text-xs font-medium uppercase tracking-wider text-white/60">
                    Starting Price
                  </p>
                  <div className="mt-1 text-3xl font-extrabold text-white">
                    {startingPrice}
                  </div>
                  <p className="mt-2 text-xs text-white/70">
                    {project.possessionDate}
                  </p>
                </div>

                <div className="divide-y divide-ink/5 px-6">
                  <div className="flex items-center justify-between py-3 text-sm">
                    <span className="text-soft">Price per sq ft</span>
                    <span className="font-bold text-ink">
                      {project.pricePerSqft}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3 text-sm">
                    <span className="text-soft">Configuration</span>
                    <span className="font-bold text-ink">
                      {configurationLabel(project.configurations)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3 text-sm">
                    <span className="text-soft">RERA ID</span>
                    <span className="font-bold text-ink">
                      {project.reraId}
                    </span>
                  </div>
                </div>

                <div className="px-6 pb-6">
                  <a
                    href={enquireUrl(project)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex w-full items-center justify-center gap-2.5 rounded-xl bg-primary px-5 py-4 text-sm font-bold text-white shadow-lg shadow-primary/25 transition-colors hover:bg-secondary"
                  >
                    {WHATSAPP_ICON}
                    Contact on WhatsApp
                  </a>
                  <a
                    href={`tel:+${WHATSAPP_NUMBER}`}
                    className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-primary/15 bg-primary/5 px-5 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
                  >
                    {PHONE_ICON}
                    Request Call Back
                  </a>
                  <p className="mt-3 text-center text-xs text-soft">
                    Site visits available 7 days a week
                  </p>
                </div>
              </div>
            </aside>
          </div>

          {/* ================= 2. COMPACT TITLE STRIP ================= */}
          <div className="mt-8">
            <nav className="flex flex-wrap items-center gap-x-2 text-xs text-soft">
              <Link href="/" className="transition-colors hover:text-accent-ink">
                Home
              </Link>
              <span>/</span>
              <Link href="/projects" className="transition-colors hover:text-accent-ink">
                Projects
              </Link>
              <span>/</span>
              <span className="font-medium text-muted">{project.title}</span>
            </nav>

            <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <h1 className="font-bold tracking-tight text-ink text-2xl sm:text-3xl">
                {project.title}
              </h1>
              <p className="flex items-center gap-1.5 text-sm font-medium text-muted">
                {MAP_PIN_ICON}
                {project.location}
              </p>
            </div>

            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
              {aboutParagraphs[0]}
            </p>
          </div>

          {/* ================= 3. QUICK FACTS ================= */}
          <div className="mt-6">
            <div className="flex gap-2.5 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-wrap lg:overflow-visible">
              {quickFacts.map((fact) => (
                <div
                  key={fact.label}
                  className="flex shrink-0 items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2"
                >
                  <span className="whitespace-nowrap text-xs text-soft">
                    {fact.label}
                  </span>
                  <span className="whitespace-nowrap text-xs font-bold text-ink">
                    {fact.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ================= 4. PROJECT USPs ================= */}
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {project.usps.map((u, i) => (
              <div
                key={u.title}
                className="rounded-2xl border border-ink/10 bg-white p-5"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/5 text-primary">
                  {USP_ICONS[i]}
                </div>
                <div className="mt-3.5 font-bold text-ink">{u.title}</div>
                <p className="mt-1 text-sm text-muted">{u.description}</p>
              </div>
            ))}
          </div>

          {/* ================= MAIN CONTENT ================= */}
          <div className="mt-14 space-y-14">
            {/* -------- 3.5. ABOUT THE PROJECT -------- */}
              <section id="about" className="scroll-mt-24">
                <SectionHeading eyebrow="Overview" title="About the Project" />
                <div className="mt-6">
                  <div className="max-w-3xl space-y-4 text-sm leading-relaxed text-muted sm:text-base">
                    {project.description ? (
                      <p>{aboutDescription}</p>
                    ) : (
                      aboutParagraphs.map((paragraph, i) => (
                        <p key={i}>{paragraph}</p>
                      ))
                    )}
                  </div>
                </div>
              </section>

              {/* -------- 4. FLAT TYPES & PRICING -------- */}
              <section id="pricing" className="scroll-mt-24">
                <SectionHeading
                  eyebrow="Inventory & pricing"
                  title="Configuration & Price"
                />
                <div className="mt-6">
                  <ConfigPriceCard project={project} />
                </div>
              </section>

              {/* -------- 5. SAMPLE FLAT + GALLERY (ACTUAL / RENDER) -------- */}
              <section id="sample-flat" className="scroll-mt-24">
                <SectionHeading
                  eyebrow="Show flat"
                  title="Sample Flat Ready: Walk Through Your Dream Home"
                />
                {project.showFlatImages && project.showFlatImages.length > 0 && (
                  <div className="mt-6">
                    <ShowFlatGallery
                      images={project.showFlatImages}
                      projectTitle={project.title}
                    />
                  </div>
                )}
                <div className="mt-6">
                  <h3 className="text-lg font-bold text-ink">
                    Watch the Project AV
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    Tap play and watch the project come alive in motion.
                  </p>
                  <div className="mt-3">
                    <VideoEmbed
                      src={project.showFlatVideoUrl}
                      title={`${project.title} project AV`}
                    />
                  </div>
                </div>
              </section>

              {/* -------- 6. AMENITIES -------- */}
              <section id="amenities" className="scroll-mt-24">
                <SectionHeading eyebrow="Lifestyle" title="Amenities" />
                {project.amenityImages &&
                  project.amenityImages.length > 0 && (
                    <div className="mt-6">
                      <AmenityShowcase images={project.amenityImages} projectTitle={project.title} />
                    </div>
                  )}
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {AMENITY_CATEGORIES.filter(
                    (cat) => categorizedAmenities[cat.key].length > 0
                  ).map((cat) => (
                    <div
                      key={cat.key}
                      className="rounded-2xl border border-ink/10 bg-white p-6"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/5 text-primary">
                          {cat.icon}
                        </span>
                        <h3 className="font-bold text-ink">{cat.label}</h3>
                      </div>
                      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                        {categorizedAmenities[cat.key].map((a) => (
                          <li
                            key={a}
                            className="flex items-start gap-2 text-sm text-muted"
                          >
                            {CHECK_ICON}
                            {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>

              {/* -------- 7. IMAGE GALLERY -------- */}
              <section id="gallery" className="scroll-mt-24">
                <SectionHeading
                  eyebrow="Photo gallery"
                  title="Project Image Gallery"
                />
                <div className="mt-6">
                  <GalleryGrid images={project.images} title={project.title} />
                </div>
              </section>

              {/* -------- 8. LOCATION & CONNECTIVITY -------- */}
              <section id="location" className="scroll-mt-24">
                <SectionHeading
                  eyebrow="Connectivity"
                  title="Location & Connectivity"
                />
                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <div className="overflow-hidden rounded-2xl border border-ink/10">
                    <iframe
                      title={`Map showing location of ${project.title}`}
                      src={`https://maps.google.com/maps?q=${encodeURIComponent(
                        project.location
                      )}&z=13&output=embed`}
                      className="h-72 w-full border-0 lg:h-full"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      allowFullScreen
                    />
                  </div>
                  <div className="rounded-2xl border border-ink/10 bg-white p-6">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-primary">
                      Nearby Landmarks
                    </h3>
                    <ul className="mt-4 divide-y divide-ink/10">
                      {project.nearbyLandmarks.map((lm) => (
                        <li
                          key={lm.name}
                          className="flex items-center justify-between py-3"
                        >
                          <span className="flex items-center gap-2.5 text-sm font-medium text-ink">
                            {MAP_PIN_ICON}
                            {lm.name}
                          </span>
                          <span className="text-sm text-soft">
                            {lm.distance}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(
                        project.location
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                      Open in Google Maps
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.22 14.78a.75.75 0 0 0 1.06 0l7.22-7.22v5.69a.75.75 0 0 0 1.5 0v-7.5a.75.75 0 0 0-.75-.75h-7.5a.75.75 0 0 0 0 1.5h5.69l-7.22 7.22a.75.75 0 0 0 0 1.06z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </a>
                  </div>
                </div>
              </section>

              {/* -------- 9. ABOUT THE DEVELOPER -------- */}
              <section id="developer" className="scroll-mt-24">
                <SectionHeading eyebrow="The developer" title="About the Developer" />
                <div className="mt-6 overflow-hidden rounded-2xl bg-primary text-white">
                  <div className="relative overflow-hidden px-8 py-9 lg:px-10">
                    <div
                      aria-hidden="true"
                      className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl"
                    />
                    <div className="relative flex flex-wrap items-center gap-6">
                      <div className="min-w-0 flex-1">
                        <span className="inline-flex items-center rounded-full bg-accent/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-accent ring-1 ring-accent/30">
                          RERA-registered developer
                        </span>
                        <h3 className="mt-2 text-2xl font-bold">
                          {project.developer.name}
                        </h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-white/60">
                          Backed by a strong record of on-time delivery,
                          transparent documentation and quality construction.
                        </p>
                      </div>
                    </div>

                    <div className="relative mt-8 grid gap-4 sm:grid-cols-3">
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <div className="text-3xl font-bold">
                          {developerYears(project.developer.since).split("+")[0]}
                          <span className="text-accent">+</span>
                        </div>
                        <div className="mt-1 text-sm text-white/60">
                          Years of experience
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <div className="break-words text-3xl font-bold">
                          {project.developer.completedProjects}
                        </div>
                        <div className="mt-1 text-sm text-white/60">
                          Completed projects
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <div className="break-all text-lg font-bold">
                          {project.reraId}
                        </div>
                        <div className="mt-1 text-sm text-white/60">
                          RERA ID
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 border-t border-white/10 bg-white/5 px-8 py-5 sm:grid-cols-3 lg:px-10">
                    {[
                      "On-time delivery",
                      "Transparent documentation",
                      "Quality construction",
                    ].map((item) => (
                      <div
                        key={item}
                        className="flex items-center gap-2 text-sm font-medium text-white/80"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-3.5 w-3.5"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.8a1 1 0 0 1 1.4 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>

          {/* ================= 11. SIMILAR PROJECTS NEARBY ================= */}
          {related.length > 0 && (
            <section className="mt-20">
              <SectionHeading
                eyebrow="Explore more"
                title="Similar Projects Nearby"
              />
              <HorizontalScroll className="mt-6">
                {related.map((p) => (
                  <Link
                    key={p.slug}
                    href={`/projects/${p.slug}`}
                    className="w-[280px] shrink-0 overflow-hidden rounded-2xl border border-ink/10 bg-white transition-shadow hover:shadow-lg"
                    style={{ scrollSnapAlign: "start" }}
                  >
                    <div className="relative aspect-[16/10] overflow-hidden">
                      <ProjectCover
                        images={p.images}
                        alt={`${p.title} in ${p.location}`}
                        className="object-cover transition-transform duration-400 ease-out hover:scale-105"
                        sizes="280px"
                      />
                      <span
                        className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                          p.status === "New Launch"
                            ? "bg-accent text-primary"
                            : "bg-white/90 text-ink"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-ink">{p.title}</h3>
                      <p className="mt-0.5 text-xs text-soft">
                        {p.location}
                      </p>
                      <p className="mt-2 text-sm font-bold text-primary">
                        {p.priceRange}
                      </p>
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent-ink">
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
              </HorizontalScroll>
            </section>
          )}
        </div>
      </div>

      {/* ================= 12. MOBILE STICKY CTA BAR ================= */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-ink/10 bg-background/95 px-4 py-3 backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                project.status === "New Launch"
                  ? "bg-accent text-primary"
                  : "bg-primary text-white"
              }`}
            >
              {project.status}
            </span>
            <div className="mt-1 truncate text-sm font-extrabold text-primary">
              {startingPrice}
            </div>
            <div className="truncate text-[11px] text-soft">
              RERA {project.reraId}
            </div>
          </div>
          <a
            href={enquireUrl(project)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary/25"
          >
            {WHATSAPP_ICON}
            WhatsApp
          </a>
        </div>
      </div>

      <div className="h-24 md:hidden" aria-hidden="true" />

      {/* ================= 13. FLOATING WHATSAPP FAB (all viewports) ================= */}
      <a
        href={enquireUrl(project)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat on WhatsApp"
        className="animate-wa-pulse fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#1DA851] text-white shadow-xl shadow-[#1DA851]/40 transition-transform hover:scale-110 md:bottom-8 md:right-8"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-7 w-7"
        >
          <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
        </svg>
      </a>
    </>
  );
}