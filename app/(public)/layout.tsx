import Footer from "@/components/Footer";
import SiteHeader from "@/components/SiteHeader";
import { absoluteUrl, jsonLd } from "@/lib/json-ld";

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${absoluteUrl("/") }#organization`,
      name: "Patang Future Homes",
      url: absoluteUrl("/"),
      logo: absoluteUrl("/brand/og-image.png"),
      image: absoluteUrl("/brand/og-image.png"),
      description:
        "Patang Future Homes is a trusted property advisory in Vasai West and Vasai East, connecting buyers and renters with premium shops, flats and bungalows across the region.",
      telephone: "+917249138197",
      areaServed: ["Vasai West", "Vasai East"],
      address: {
        "@type": "PostalAddress",
        addressLocality: "Vasai West",
        addressRegion: "Maharashtra",
        addressCountry: "IN",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${absoluteUrl("/") }#website`,
      url: absoluteUrl("/"),
      name: "Patang Future Homes",
      publisher: { "@id": `${absoluteUrl("/") }#organization` },
    },
    {
      "@type": "RealEstateAgent",
      "@id": `${absoluteUrl("/") }#realestateagent`,
      parentOrganization: {
        "@id": `${absoluteUrl("/") }#organization`,
      },
      name: "Patang Future Homes",
      url: absoluteUrl("/"),
      image: absoluteUrl("/brand/og-image.png"),
      description:
        "Patang Future Homes helps you find the right property in Vasai West and Vasai East, from premium flats to luxury bungalows and commercial spaces, with trusted guidance at every step.",
      telephone: "+917249138197",
      priceRange: "₹₹",
      areaServed: ["Vasai West", "Vasai East"],
      address: {
        "@type": "PostalAddress",
        addressLocality: "Vasai West",
        addressRegion: "Maharashtra",
        addressCountry: "IN",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: 19.3919,
        longitude: 72.8317,
      },
    },
  ],
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(organizationJsonLd)}
      />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}