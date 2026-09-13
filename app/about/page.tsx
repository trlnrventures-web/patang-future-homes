import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

const STATS = [
  { stat: "500+", label: "Properties Listed" },
  { stat: "15+", label: "Years Experience" },
  { stat: "1000+", label: "Happy Clients" },
  { stat: "100%", label: "Verified Projects" },
];

const SERVICES = [
  {
    title: "Buy & Sell",
    description:
      "From your first home to your best investment — we help you buy and sell with clarity, negotiation and full paperwork support.",
    icon: <HomeIcon />,
  },
  {
    title: "Rent & Lease",
    description:
      "Owners, find reliable tenants fast. Renters, discover verified homes. We manage listings, verification and agreements.",
    icon: <KeyIcon />,
  },
  {
    title: "Expert Guidance",
    description:
      "Market trends, legal checks, pricing — tap into honest, local expertise at every stage of your property journey.",
    icon: <CompassIcon />,
  },
];

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "About Us — Vasai's Trusted Property Advisors",
    description:
      "Learn about Patang Future Homes — Vasai's trusted property advisors connecting owners with buyers and renters across Vasai West and Vasai East.",
    keywords: [
      "about Patang Future Homes",
      "property advisors Vasai West",
      "real estate consultants Vasai East",
      "Vasai property experts",
    ],
    alternates: {
      canonical: "/about",
    },
    openGraph: {
      type: "website",
      title: "About Us — Vasai's Trusted Property Advisors",
      description:
        "Patang Future Homes is Vasai's trusted property advisory connecting owners with buyers and renters across Vasai West and Vasai East.",
      url: "/about",
      images: [
        {
          url: "/og-image.jpg",
          width: 1200,
          height: 630,
          alt: "Patang Future Homes — about the Vasai property advisory team",
        },
      ],
    },
  };
}

export default function AboutPage() {
  return (
    <>
      {/* Header */}
      <section className="bg-lavender pt-28 pb-12 lg:pt-36 lg:pb-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            About Patang Future Homes
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            Trusted property advisory for a better tomorrow.
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">
                Who we are
              </h2>
              <div className="mt-5 space-y-4 text-sm leading-relaxed text-muted sm:text-base">
                <p>
                  Patang Future Homes is a Vasai-based property advisory
                  connecting property owners with buyers and renters across
                  Vasai West and Vasai East. We help families find homes they
                  love and guide investors toward opportunities that perform —
                  with honest advice at every step.
                </p>
                <p>
                  With deep knowledge of the local market, from the
                  family-friendly neighbourhoods of Vasai West to the
                  fast-growing corridors of Vasai East, we match every client
                  with the right property — transparent pricing, verified
                  listings and paperwork handled end to end.
                </p>
              </div>
            </div>
            <div className="relative aspect-[4/3]">
              <Image
                src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1000&q=80"
                alt="The Patang Future Homes team at work"
                fill
                className="rounded-2xl object-cover"
                sizes="(min-width: 1024px) 50vw, 100vw"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section className="bg-primary py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
            {STATS.map((item) => (
              <div key={item.label} className="text-center">
                <div className="mx-auto h-0.5 w-8 rounded-full bg-accent" />
                <div className="mt-4 text-4xl font-bold text-white">
                  {item.stat}
                </div>
                <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-white/70">
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What we do */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
          <h2 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">
            What we do
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {SERVICES.map((service) => (
              <div
                key={service.title}
                className="rounded-2xl border border-border bg-white p-6 shadow-sm"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-lavender text-primary">
                  {service.icon}
                </span>
                <h3 className="mt-4 font-bold text-navy">{service.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {service.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why choose us */}
      <section className="bg-lavender py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="h-1 w-12 rounded-full bg-accent" />
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-navy sm:text-3xl">
                Why choose us
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
                We believe a great property journey is built on values: honesty
                about every listing, patience with every client, and a deep
                pride in the Vasai we call home. That&apos;s why decisions here
                are made by people who know the local streets, prices and
                developers — not call centres. Add our end-to-end support, and
                you get an advisor who stays with you long after the keys are
                handed over.
              </p>
              <Link
                href="/contact"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2.5 transition-all"
              >
                Learn More →
              </Link>
            </div>
            <div className="relative aspect-[16/10]">
              <Image
                src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1000&q=80"
                alt="Skyline of the Vasai area served by Patang Future Homes"
                fill
                className="rounded-2xl object-cover"
                sizes="(min-width: 1024px) 50vw, 100vw"
              />
            </div>
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="bg-lavender border-t border-white/70 py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-5 text-center lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">
            Ready to find your next property?
          </h2>
          <Link
            href="/properties"
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-secondary"
          >
            Explore Properties →
          </Link>
        </div>
      </section>
    </>
  );
}

function HomeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M15 7a4 4 0 1 0-3.7 4.8L3 20v3h3v-2h2v-2h2v-2h2l2.3-2.3A4 4 0 0 0 15 7Z" />
      <circle cx="15.5" cy="6.5" r="1" />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </svg>
  );
}