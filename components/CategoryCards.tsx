import Link from "next/link";
import Image from "next/image";

const CATEGORIES = [
  {
    type: "shop" as const,
    label: "Shops",
    image:
      "https://images.unsplash.com/photo-1674286388329-837db73581c3?w=800&q=80",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-5 w-5"
      >
        <path d="M2 20h20v2H2v-2zm2-3h2v2H4v-2zm4-3h2v2H8v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2zm-8-3h2v2H8v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2zm-4-3h2v2h-2V8zm4 0h2v2h-2V8zm2-5H6c-1.1 0-2 .9-2 2v3h2V5h12v3h2V5c0-1.1-.9-2-2-2z" />
      </svg>
    ),
    radius: "rounded-xl",
  },
  {
    type: "flat" as const,
    label: "Flats",
    image: "/projects/pam-one-time-vasai-edition/Elevation/Evening-View.webp",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-5 w-5"
      >
        <path d="M17 11V3H7v4H3v14h8v-4h2v4h8V11h-4zM7 19H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm4 4H9v-2h2v2zm0-4H9V9h2v2zm0-4H9V5h2v2zm4 8h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm4 12h-2v-2h2v2zm0-4h-2v-2h2v2z" />
      </svg>
    ),
    radius: "rounded-xl",
  },
  {
    type: "bungalow" as const,
    label: "Bungalows",
    image:
      "https://images.unsplash.com/photo-1726995036039-1ff318dd445c?w=800&q=80",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-5 w-5"
      >
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
      </svg>
    ),
    radius: "rounded-xl",
  },
];

export default function CategoryCards() {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
          Browse inventory
        </div>
        <h2 className="mt-2 font-bold text-ink text-2xl sm:text-3xl">
          Explore by Category
        </h2>
        <p className="mt-2 text-sm text-muted">
          Find the property type that fits your needs.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.type}
              href={`/projects?type=${cat.type}`}
              className={`group relative block aspect-[4/3] overflow-hidden shadow-md transition-shadow hover:shadow-xl ${cat.radius}`}
            >
              <Image
                src={cat.image}
                alt={`${cat.label} in Vasai West`}
                fill
                className="object-cover transition-transform duration-400 ease-out group-hover:scale-[1.04]"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />

              {/* Bottom gradient overlay: 40% height */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.40) 30%, transparent 55%)",
                }}
              />

              {/* Label */}
              <div className="absolute bottom-0 left-0 flex items-center gap-2.5 p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white backdrop-blur-sm">
                  {cat.icon}
                </span>
                <span className="text-base font-semibold text-white">
                  {cat.label}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
