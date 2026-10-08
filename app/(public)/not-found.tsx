import Link from "next/link";

const SUGGESTIONS = [
  { href: "/projects", label: "All Projects" },
  { href: "/properties", label: "All Properties" },
  { href: "/vasai-west", label: "Vasai West" },
  { href: "/vasai-east", label: "Vasai East" },
  { href: "/vasai-west/2-bhk", label: "2 BHK Flats in Vasai West" },
  { href: "/contact", label: "Talk to an Advisor" },
];

export default function NotFound() {
  return (
    <section className="bg-lavender pt-32 pb-24 lg:pt-44 lg:pb-32">
      <div className="mx-auto max-w-3xl px-5 text-center lg:px-8">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
          Error 404
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-navy sm:text-4xl">
          This page could not be found
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          The link may be outdated, or the page has moved. Pick a suggestion
          below, or contact us and we will send you the right property details.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          {SUGGESTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-primary hover:text-primary"
            >
              {s.label}
            </Link>
          ))}
        </div>

        <Link
          href="/"
          className="mt-10 inline-block rounded-full bg-primary px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-secondary"
        >
          Back to Home
        </Link>
      </div>
    </section>
  );
}
