import type { Metadata } from "next";
import RentVsBuyCalculator from "@/components/RentVsBuyCalculator";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Rent vs Buy Calculator — Should I Rent or Buy in Vasai?",
    description:
      "Compare renting vs buying a home with our free calculator. Input your rent, property price, down payment and interest rate to see which option builds more wealth over time.",
    keywords: [
      "rent vs buy calculator",
      "should I rent or buy",
      "buy or rent house India",
      "rent vs buy Vasai",
    ],
    alternates: {
      canonical: "/rent-vs-buy-calculator",
    },
    openGraph: {
      type: "website",
      title: "Rent vs Buy Calculator — Should I Rent or Buy in Vasai?",
      description:
        "Free rent vs buy calculator — compare the long-term wealth of renting versus buying a home in Vasai.",
      url: "/rent-vs-buy-calculator",
      images: [
        {
          url: "/og-image.jpg",
          width: 1200,
          height: 630,
          alt: "Rent vs buy calculator by Patang Future Homes",
        },
      ],
    },
  };
}

export default function RentVsBuyCalculatorPage() {
  return (
    <>
      <section className="bg-lavender pt-28 pb-12 lg:pt-36 lg:pb-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
            Free online tool
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            Rent vs Buy Calculator
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            One of the biggest money decisions you&apos;ll make. Compare the
            financial outcome of renting versus buying over the same period.
          </p>
        </div>
      </section>

      <RentVsBuyCalculator />

      {/* SEO content block */}
      <section className="bg-white pb-16 lg:pb-20">
        <div className="mx-auto max-w-4xl px-5 lg:px-8">
          <h2 className="text-2xl font-bold text-navy">
            Rent or Buy? A Quick Guide
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
            In Vasai, where property prices have historically risen with
            infrastructure development, buying can be a strong wealth-building
            move. But the right answer depends on your situation.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-ink/10 bg-white p-5">
              <h3 className="font-bold text-navy">Buying makes sense if:</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted">
                <li>You plan to stay for 5+ years.</li>
                <li>Your EMI is comfortable within 40% of your income.</li>
                <li>You want stability and an asset that appreciates.</li>
                <li>You can manage the down payment and registration costs.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-ink/10 bg-white p-5">
              <h3 className="font-bold text-navy">Renting makes sense if:</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted">
                <li>You may relocate in the next 2–3 years.</li>
                <li>Your job or business income is uncertain.</li>
                <li>You don&apos;t yet have the down payment.</li>
                <li>
                  You can invest the difference and beat property appreciation.
                </li>
              </ul>
            </div>
          </div>

          <p className="mt-6 text-sm leading-relaxed text-muted sm:text-base">
            Our calculator models both paths over your chosen time horizon —
            including rent escalation, home appreciation and the opportunity
            cost of your down payment — to show you which option leaves you with
            more wealth.
          </p>

          <div className="mt-12 rounded-2xl border border-ink/10 bg-lavender p-6">
            <h3 className="text-lg font-bold text-navy">
              Need help deciding?
            </h3>
            <p className="mt-2 text-sm text-muted">
              Patang Future Homes can walk you through rental yields, pricing
              trends and buyer costs across Vasai West &amp; Vasai East.
            </p>
            <a
              href="https://wa.me/919657447246"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-secondary"
            >
              Talk to Us on WhatsApp →
            </a>
          </div>
        </div>
      </section>
    </>
  );
}