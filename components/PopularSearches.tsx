import Link from "next/link";

const SEARCHES = [
  { label: "1 BHK in Vasai West", href: "/vasai-west/1-bhk" },
  { label: "1 BHK in Vasai East", href: "/vasai-east/1-bhk" },
  { label: "2 BHK in Vasai West", href: "/vasai-west/2-bhk" },
  { label: "2 BHK in Vasai East", href: "/vasai-east/2-bhk" },
  { label: "3 BHK in Vasai West", href: "/vasai-west/3-bhk" },
  { label: "3 BHK in Vasai East", href: "/vasai-east/3-bhk" },
  {
    label: "1 BHK Flat in Vasai West under 30 Lakhs",
    href: "/projects?type=flat&area=west",
  },
  {
    label: "2 BHK Flats in Vasai West near Station",
    href: "/projects?type=flat&area=west",
  },
  { label: "New Projects in Vasai West", href: "/projects?area=west" },
  { label: "New Projects in Vasai East", href: "/projects?area=east" },
  {
    label: "Under Construction Projects in Vasai East",
    href: "/projects?area=east",
  },
  {
    label: "Vasai West 1 BHK Flat Rent",
    href: "/projects?type=flat&area=west",
  },
  {
    label: "Vasai West 2 BHK Flat Price",
    href: "/projects?type=flat&area=west",
  },
  { label: "Shops for Sale in Vasai West", href: "/projects?type=shop&area=west" },
  { label: "Bungalows in Vasai West", href: "/projects?type=bungalow&area=west" },
];

export default function PopularSearches() {
  return (
    <section className="bg-white py-12 lg:py-16">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
          Trending now
        </div>
        <h2 className="mt-2 font-bold text-ink text-xl sm:text-2xl">
          Popular Searches
        </h2>

        <div className="mt-6 flex flex-wrap gap-2.5">
          {SEARCHES.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className="rounded-full border border-ink/10 bg-background px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}