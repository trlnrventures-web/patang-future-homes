import type { Metadata } from "next";
import { inter, plusJakarta } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Patang Future Homes | Premium Properties in Vasai West",
    template: "%s | Patang Future Homes",
  },
  description:
    "Discover premium residential and commercial properties in Vasai West. Shops, flats, and bungalows by Patang Future Homes, your trusted real estate partner.",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plusJakarta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {children}
      </body>
    </html>
  );
}