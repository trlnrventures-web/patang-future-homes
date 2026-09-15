import type { Metadata } from "next";
import RoiCalculator from "@/components/RoiCalculator";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Property ROI Calculator | Real Estate Returns",
    description:
      "Calculate the return on investment for a property, factoring in rental yield plus capital appreciation. Free ROI calculator for flats, shops and bungalows in Vasai.",
    keywords: [
      "property ROI calculator",
      "real estate ROI calculator",
      "rental yield calculator",
      "investment property return India",
    ],
    alternates: {
      canonical: "/roi-calculator",
    },
    openGraph: {
      type: "website",
      title: "Property ROI Calculator | Real Estate Returns",
      description:
        "Free property ROI calculator, see rental yield plus capital appreciation for flats, shops and bungalows in Vasai.",
      url: "/roi-calculator",
      images: [
        {
          url: "/og-image.jpg",
          width: 1200,
          height: 630,
          alt: "Property ROI calculator by Patang Future Homes",
        },
      ],
    },
  };
}

export default function RoiCalculatorPage() {
  return (
    <>
      <section className="bg-lavender pt-28 pb-12 lg:pt-36 lg:pb-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
            Free online tool
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            Property ROI Calculator
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            See the full picture of a property investment, rental income plus
            capital appreciation over time.
          </p>
        </div>
      </section>

      <RoiCalculator />

      {/* SEO content block */}
      <section className="bg-white pb-16 lg:pb-20">
        <div className="mx-auto max-w-4xl px-5 lg:px-8">
          <h2 className="text-2xl font-bold text-navy">
            How to Measure a Property&apos;s Returns
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
            Real estate returns come from two sources:{" "}
            <strong>rental income</strong> and <strong>capital appreciation</strong>.
            Rental yield expresses annual net rent as a percentage of the price,
            while total ROI adds capital gains over the holding period.
          </p>

          <h2 className="mt-10 text-2xl font-bold text-navy">
            Typical Rental Yields in Vasai
          </h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted sm:text-base">
            <li>
              <strong>Flats:</strong> usually 2.5% – 3.5% net yield.
            </li>
            <li>
              <strong>Commercial shops:</strong> usually 4% – 6%, with higher
              yields but higher vacancy risk.
            </li>
            <li>
              <strong>Bungalows:</strong> often 2% – 3%, driven more by
              appreciation than rent.
            </li>
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Don&apos;t forget expenses: maintenance, society charges, property
            tax, brokerage and periods of vacancy all eat into your net yield.
          </p>

          <div className="mt-12 rounded-2xl border border-ink/10 bg-lavender p-6">
            <h3 className="text-lg font-bold text-navy">
              Looking for a high-yield investment in Vasai?
            </h3>
            <p className="mt-2 text-sm text-muted">
              From commercial shops to appreciating bungalows, Patang Future
              Homes can help you pick the right asset.
            </p>
            <a
              href="https://wa.me/917249138197"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-secondary"
            >
              Talk to Us on WhatsApp →
            </a>
          </div>
        </div>
      </section>
    </>
  );
}