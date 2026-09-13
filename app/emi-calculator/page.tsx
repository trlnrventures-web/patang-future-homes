import type { Metadata } from "next";
import EmiCalculator from "@/components/EmiCalculator";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title:
      "Home Loan EMI Calculator | Calculate Monthly EMI — Patang Future Homes",
    description:
      "Calculate your home loan EMI instantly with our free calculator. Enter loan amount, interest rate and tenure to see monthly payments, total interest and total payment.",
    keywords: [
      "home loan EMI calculator",
      "EMI calculator India",
      "loan EMI calculator",
      "monthly EMI calculator Vasai",
    ],
  };
}

export default function EmiCalculatorPage() {
  return (
    <>
      <section className="bg-lavender pt-28 pb-12 lg:pt-36 lg:pb-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
            Free online tool
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            Home Loan EMI Calculator
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            Know exactly what your monthly instalment will be — before you
            commit to a home loan.
          </p>
        </div>
      </section>

      <EmiCalculator />

      {/* SEO content block */}
      <section className="bg-white pb-16 lg:pb-20">
        <div className="mx-auto max-w-4xl px-5 lg:px-8">
          <h2 className="text-2xl font-bold text-navy">
            What is an EMI?
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
            EMI, or Equated Monthly Instalment, is the fixed amount you pay your
            lender every month until your home loan is fully repaid. It includes
            both the interest and a portion of the principal. The EMI is
            calculated on a reducing-balance basis, so as you repay, the interest
            portion falls and the principal portion rises.
          </p>

          <h2 className="mt-10 text-2xl font-bold text-navy">
            Formula Used by Our EMI Calculator
          </h2>
          <div className="mt-4 rounded-xl bg-lavender p-5 text-center font-mono text-sm font-semibold text-navy">
            EMI = P × r × (1 + r)<sup>n</sup> ÷ ((1 + r)<sup>n</sup> – 1)
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
            Where <strong>P</strong> is the loan principal, <strong>r</strong> is
            the monthly interest rate (annual rate ÷ 12 ÷ 100), and{" "}
            <strong>n</strong> is the loan tenure in months.
          </p>

          <h2 className="mt-10 text-2xl font-bold text-navy">
            How to Use the EMI Calculator
          </h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted sm:text-base">
            <li>
              <strong>Loan Amount:</strong> The principal you plan to borrow.
              Keep it within your eligibility.
            </li>
            <li>
              <strong>Interest Rate:</strong> Enter the rate your bank is
              offering — typically 8% to 9.5% in 2026.
            </li>
            <li>
              <strong>Tenure:</strong> Longer tenures lower the EMI but
              increase total interest. Choose what suits your budget.
            </li>
          </ul>

          <div className="mt-12 rounded-2xl border border-ink/10 bg-lavender p-6">
            <h3 className="text-lg font-bold text-navy">
              Planning to buy a home in Vasai?
            </h3>
            <p className="mt-2 text-sm text-muted">
              Explore verified flats, bungalows and commercial spaces across
              Vasai West &amp; Vasai East through Patang Future Homes.
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