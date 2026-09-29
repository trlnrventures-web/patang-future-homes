import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest. Purple splash background, white logo on top
// (see public/brand/PFH_512_white_nobg_horizontal.png) - the purple logo on
// purple measures 1.79:1 contrast and disappears.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Patang Future Homes",
    short_name: "Patang",
    description:
      "Premium residential and commercial properties in Vasai West, Vasai East and beyond.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#32105f",
    theme_color: "#32105f",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
