import type { Metadata } from "next";
import Link from "next/link";
import PropertiesExplorer from "@/components/PropertiesExplorer";

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const params = await searchParams;
  const hasFilterParams = Object.keys(params).length > 0;

  return {
    title: "Properties for Sale in Vasai",
    description:
      "Browse flats, bungalows and shops for sale in Vasai West & East. Filter by type, configuration, location and budget, with prices and carpet areas on every listing.",
    keywords: [
      "properties for sale in Vasai West",
      "flats for sale in Vasai East",
      "shops for sale in Vasai",
      "bungalows in Vasai West",
      "property listings Palghar",
    ],
    alternates: {
      canonical: "/properties",
    },
    robots: hasFilterParams ? { index: false, follow: true } : undefined,
  };
}

export default function PropertiesPage() {
  return (
    <>
      <section className="bg-lavender pt-28 pb-12 lg:pt-36 lg:pb-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            Properties for Sale in Vasai West &amp; East
          </h1>
          <p className="mt-3 max-w-3xl text-base text-muted">
            Browse every flat, bungalow and commercial space we have listed
            across Vasai West and Vasai East. Filter by type, BHK
            configuration, sub-location and budget to shortlist homes that fit
            you, then book a free site visit. Looking for a specific area?
            Start with our{" "}
            <Link
              href="/vasai-west"
              className="font-medium text-primary hover:underline"
            >
              Vasai West
            </Link>{" "}
            or{" "}
            <Link
              href="/vasai-east"
              className="font-medium text-primary hover:underline"
            >
              Vasai East
            </Link>{" "}
            area guides.
          </p>
        </div>
      </section>
      <PropertiesExplorer />
    </>
  );
}