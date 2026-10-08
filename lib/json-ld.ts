export const SITE_URL = "https://patangfuturehomes.com";

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

/** Safe props for a JSON-LD <script> tag (escapes "<" per Next.js docs). */
export function jsonLd(data: unknown): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
