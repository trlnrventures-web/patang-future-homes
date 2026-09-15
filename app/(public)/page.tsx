import type { Metadata } from "next";
import Hero from "@/components/Hero";
import CategoryCards from "@/components/CategoryCards";
import NewProjects from "@/components/NewProjects";
import Stats from "@/components/Stats";
import Testimonials from "@/components/Testimonials";
import FAQ from "@/components/FAQ";
import PopularSearches from "@/components/PopularSearches";

export const metadata: Metadata = {
  title: "Premium Flats, Shops & Bungalows in Vasai West",
  description:
    "Patang Future Homes is Vasai's trusted property advisory. Explore RERA-registered flats, bungalows and commercial shops across Vasai West & Vasai East with honest, expert guidance at every step.",
  keywords: [
    "flats in Vasai West",
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
    title: "Premium Flats, Shops & Bungalows in Vasai West",
    description:
      "Discover RERA-registered flats, bungalows and commercial shops across Vasai West & Vasai East with Patang Future Homes.",
    url: "/",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Patang Future Homes, premium properties in Vasai",
      },
    ],
  },
};

export default function Home() {
  return (
    <>
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