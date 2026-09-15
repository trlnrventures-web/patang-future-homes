import type { Metadata } from "next";
import HomeLoanCalculator from "@/components/HomeLoanCalculator";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Home Loan Eligibility & EMI Calculator | Free Online Tool",
    description:
      "Check your home loan eligibility and calculate monthly EMIs instantly. Free online calculator for buyers looking at flats, bungalows and shops in Vasai West & Vasai East.",
    keywords: [
      "home loan eligibility calculator",
      "home loan EMI calculator",
      "housing loan calculator India",
      "home loan calculator Vasai",
      "property loan eligibility",
    ],
    alternates: {
      canonical: "/home-loan-calculator",
    },
    openGraph: {
      type: "website",
      title: "Home Loan Eligibility & EMI Calculator | Free Online Tool",
      description:
        "Check how much home loan you can afford and your monthly EMI, with a free, instant eligibility and EMI calculator for Vasai property buyers.",
      url: "/home-loan-calculator",
      images: [
        {
          url: "/og-image.jpg",
          width: 1200,
          height: 630,
          alt: "Home loan eligibility and EMI calculator by Patang Future Homes",
        },
      ],
    },
  };
}

export default function HomeLoanCalculatorPage() {
  return (
    <>
      <section className="bg-lavender pt-28 pb-12 lg:pt-36 lg:pb-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
            Free online tool
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            Home Loan Eligibility &amp; EMI Calculator
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            Find out how much you can borrow and what your monthly EMI will be,
            before you talk to a bank. 100% free, instant and without any
            obligation.
          </p>
        </div>
      </section>

      <HomeLoanCalculator />

      {/* SEO content block */}
      <section className="bg-white py-16 lg:py-20">
        <div className="mx-auto max-w-4xl px-5 lg:px-8">
          <h2 className="text-2xl font-bold text-navy">
            How Home Loan Eligibility Works
          </h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted sm:text-base">
            <p>
              Banks and HFCs in India typically allow a home loan EMI that does
              not exceed <strong>40–50% of your monthly take-home income</strong>.
              Your existing EMIs (car loan, personal loan, credit card dues) are
              subtracted from that ceiling to arrive at the maximum EMI you can
              afford, and from there, the maximum loan amount is derived.
            </p>
            <p>
              The <strong>Loan Eligibility Calculator</strong> above applies the
              standard 40% FOIR (Fixed Obligation to Income Ratio) rule used by
              most Indian lenders. Simply enter your monthly take-home income,
              existing EMIs, preferred interest rate and tenure to see the maximum
              loan you qualify for.
            </p>
          </div>

          <h2 className="mt-10 text-2xl font-bold text-navy">
            How EMI is Calculated
          </h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted sm:text-base">
            <p>
              EMI (Equated Monthly Instalment) is calculated using the
              reducing-balance method:
            </p>
            <div className="rounded-xl bg-lavender p-5 text-center font-mono text-sm font-semibold text-navy">
              EMI = P × r × (1 + r)<sup>n</sup> ÷ ((1 + r)<sup>n</sup> – 1)
            </div>
            <p>
              Where <strong>P</strong> is the loan principal, <strong>r</strong> is
              the monthly interest rate and <strong>n</strong> is the total number
              of monthly instalments. Use the <strong>EMI Calculator</strong> tab
              above to see your exact monthly payment for any loan amount.
            </p>
          </div>

          <h2 className="mt-10 text-2xl font-bold text-navy">
            Factors That Affect Your Home Loan
          </h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted sm:text-base">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Credit Score (CIBIL):</strong> A score of 750+ typically
                gets you the best interest rates. Scores below 650 may lead to
                rejection or higher rates.
              </li>
              <li>
                <strong>Age &amp; Tenure:</strong> Younger applicants get longer
                tenures and higher eligibility. The maximum tenure is usually up
                to 30 years or retirement age, whichever is earlier.
              </li>
              <li>
                <strong>Existing Debt:</strong> Outstanding EMIs reduce your
                eligible loan amount. Pay off smaller loans before applying.
              </li>
              <li>
                <strong>Property Type &amp; Location:</strong> Lenders may offer
                different LTV (Loan to Value) ratios depending on whether the
                property is under construction or ready possession.
              </li>
              <li>
                <strong>Income Stability:</strong> Salaried applicants with
                stable employment and self-employed with consistent ITR filings
                get better terms.
              </li>
            </ul>
          </div>

          <div className="mt-12 rounded-2xl border border-ink/10 bg-lavender p-6">
            <h3 className="text-lg font-bold text-navy">
              Looking to buy a property in Vasai?
            </h3>
            <p className="mt-2 text-sm text-muted">
              Patang Future Homes connects you with verified flats, bungalows and
              commercial spaces across Vasai West &amp; Vasai East. We can also
              help you connect with the right lender for the best home loan
              rates.
            </p>
            <a
              href="https://wa.me/917249138197"
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
