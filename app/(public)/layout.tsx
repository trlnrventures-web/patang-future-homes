import Footer from "@/components/Footer";
import SiteHeader from "@/components/SiteHeader";

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
      telephone: "+917249138197",
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
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationJsonLd),
        }}
      />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}