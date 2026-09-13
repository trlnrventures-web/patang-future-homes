import type { Metadata } from "next";
import { inter, plusJakarta } from "./fonts";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: {
    default: "Patang Future Homes | Premium Properties in Vasai West",
    template: "%s | Patang Future Homes",
  },
  description:
    "Discover premium residential and commercial properties in Vasai West. Shops, flats, and bungalows by Patang Future Homes — your trusted real estate partner.",
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "Patang Future Homes",
    title: "Patang Future Homes | Premium Properties in Vasai West",
    description:
      "Discover premium residential and commercial properties in Vasai West. Shops, flats, and bungalows by Patang Future Homes.",
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
    title: "Patang Future Homes | Premium Properties in Vasai West",
    description:
      "Discover premium residential and commercial properties in Vasai West.",
    images: ["/og-image.jpg"],
  },
  keywords: [
    "properties in Vasai West",
    "properties in Vasai East",
    "real estate Vasai",
    "Patang Future Homes",
    "flats shops and bungalows in Vasai",
  ],
  other: {
    "geo.region": "IN-MH",
    "geo.placename": "Vasai West, Maharashtra",
    "geo.position": "19.3919;72.8317",
    ICBM: "19.3919, 72.8317",
  },
  metadataBase: new URL("https://patangfuturehomes.com"),
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://patangfuturehomes.com/#organization",
      name: "Patang Future Homes",
      url: "https://patangfuturehomes.com/",
      description:
        "Patang Future Homes is a trusted property advisory in Vasai West and Vasai East, connecting buyers and renters with premium shops, flats and bungalows across the region.",
      telephone: "+919657447246",
      areaServed: ["Vasai West", "Vasai East"],
    },
    {
      "@type": "RealEstateAgent",
      "@id": "https://patangfuturehomes.com/#realestateagent",
      parentOrganization: {
        "@id": "https://patangfuturehomes.com/#organization",
      },
      name: "Patang Future Homes",
      url: "https://patangfuturehomes.com/",
      description:
        "Patang Future Homes helps you find the right property in Vasai West and Vasai East — from premium flats to luxury bungalows and commercial spaces, with trusted guidance at every step.",
      telephone: "+919657447246",
      priceRange: "₹₹",
      areaServed: ["Vasai West", "Vasai East"],
      address: {
        "@type": "PostalAddress",
        addressLocality: "Vasai West",
        addressRegion: "Maharashtra",
        addressCountry: "IN",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plusJakarta.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}