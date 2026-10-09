import type { Metadata, Viewport } from "next";
import { inter, plusJakarta } from "./fonts";
import "./globals.css";

// `viewportFit: "cover"` is what makes `env(safe-area-inset-*)` resolve to a
// real value, so the CRM's fixed bottom navigation clears the iPhone home
// indicator instead of sitting under it.
export const viewport: Viewport = {
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "Patang Future Homes | Premium Properties in Vasai West",
    template: "%s | Patang Future Homes",
  },
  description:
    "Discover premium residential and commercial properties in Vasai West. Shops, flats, and bungalows by Patang Future Homes, your trusted real estate partner.",
  icons: {
    icon: [
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Patang Future Homes",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "Patang Future Homes",
    title: "Patang Future Homes | Premium Properties in Vasai West",
    description:
      "Discover premium residential and commercial properties in Vasai West. Shops, flats, and bungalows by Patang Future Homes.",
    images: [
      {
        url: "/brand/og-image.png",
        width: 1200,
        height: 630,
        alt: "Patang Future Homes",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og-image.png"],
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