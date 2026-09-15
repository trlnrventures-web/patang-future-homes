import type { Metadata } from "next";
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
    title: "Properties for Sale & Rent in Vasai West & East",
    description:
      "Browse authentic property listings in Vasai West and Vasai East. Flats, bungalows and commercial spaces for sale and rent, filter by type, configuration, location and budget.",
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
            Explore Properties in Vasai
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            Browse flats, bungalows and commercial spaces across Vasai West
            &amp; Vasai East. Use the filters below to find the right property
            for your budget and needs.
          </p>
        </div>
      </section>
      <PropertiesExplorer />
    </>
  );
}