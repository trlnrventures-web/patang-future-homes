import type { Metadata } from "next";
import Hero from "@/components/Hero";
import CategoryCards from "@/components/CategoryCards";
import NewProjects from "@/components/NewProjects";
import Stats from "@/components/Stats";
import Testimonials from "@/components/Testimonials";
import FAQ from "@/components/FAQ";
import PopularSearches from "@/components/PopularSearches";
import { HOME_FAQS } from "@/data/home-faqs";
import { jsonLd } from "@/lib/json-ld";

const TITLE = "1, 2 & 3 BHK Flats in Vasai West | Patang Future Homes";
const DESCRIPTION =
  "Buy 1, 2 & 3 BHK flats in Vasai West with price lists, floor plans and RERA projects. Compare shops & bungalows across Vasai and book a free site visit.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "flats in Vasai West",
    "1 BHK flat in Vasai West",
    "2 BHK flat in Vasai West",
    "new projects in Vasai West",
    "shops for sale in Vasai West",
    "bungalows in Vasai East",
    "property advisors Vasai",
    "real estate Vasai West",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    images: [
      {
        url: "/brand/og-image.png",
        width: 1200,
        height: 630,
        alt: "Patang Future Homes, premium properties in Vasai",
      },
    ],
  },
};

const homeJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: HOME_FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(homeJsonLd)}
      />
      <Hero />
      <CategoryCards />
      <NewProjects />
      <Stats />
      <Testimonials />
      <FAQ />
      <PopularSearches />
    </>
  );
}