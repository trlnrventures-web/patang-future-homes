import type { Metadata } from "next";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Disclaimer | Patang Future Homes",
    description:
      "Disclaimer for Patang Future Homes — important information about the accuracy of property listings, pricing and content on this platform.",
    robots: { index: false, follow: true },
  };
}

export default function DisclaimerPage() {
  return (
    <>
      <section className="bg-lavender pt-28 pb-12 lg:pt-36 lg:pb-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            Disclaimer
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted">
            Last updated: September 2026
          </p>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-4xl px-5 py-16 lg:px-8 lg:py-20">
          <div className="prose prose-sm max-w-none space-y-6 text-sm leading-relaxed text-muted sm:text-base">
            <p>
              The information on this platform, including property listings,
              project details, and pricing, is for general informational
              purposes only. While we strive for accuracy, we make no
              warranties about the completeness or reliability of any content.
            </p>
            <p>
              Users should independently verify all information before making
              any purchasing or investment decisions. This platform does not
              constitute an offer or recommendation to buy or sell property.
            </p>
            <p>
              We disclaim any liability for loss or damage arising from use of
              or reliance on this information.
            </p>

            <h2 className="text-xl font-bold text-navy">
              Property Listings &amp; Pricing
            </h2>
            <p>
              All property details — including pricing, availability, floor
              plans, possession dates, images, renderings and specifications —
              are sourced from developers and third-party sources. These are
              subject to change without prior notice. Visuals are for
              illustrative purposes only and may differ from the final product.
            </p>

            <h2 className="text-xl font-bold text-navy">RERA Compliance</h2>
            <p>
              RERA registration numbers are provided for transparency and
              reference only. Users are strongly advised to verify all project
              details directly with the respective State RERA authority before
              making any commitments.
            </p>

            <h2 className="text-xl font-bold text-navy">
              Third-Party Links
            </h2>
            <p>
              This platform may contain links to third-party websites. We do
              not endorse or assume any responsibility for the content, privacy
              practices, or reliability of any external sites.
            </p>

            <h2 className="text-xl font-bold text-navy">
              Financial &amp; Loan Information
            </h2>
            <p>
              Any calculators, eligibility tools or financial information
              provided on this platform are for general guidance only and do
              not constitute financial advice. Actual loan terms, interest
              rates and eligibility are determined solely by the lender.
              Consult a qualified financial advisor before making borrowing
              decisions.
            </p>

            <h2 className="text-xl font-bold text-navy">Trademarks</h2>
            <p>
              All trademarks, logos, and images belong to their respective
              owners and are used for identification purposes only.
            </p>

            <div className="mt-10 border-t border-ink/10 pt-6">
              <Link
                href="/"
                className="text-sm font-semibold text-primary hover:underline"
              >
                ← Back to Home
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
