import type { Metadata } from "next";
import StampDutyCalculator from "@/components/StampDutyCalculator";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title:
      "Stamp Duty Calculator | Maharashtra Property Cost — Patang Future Homes",
    description:
      "Calculate stamp duty and registration charges for properties in Maharashtra (Vasai West & Vasai East). Choose buyer gender and area type to estimate your total cost instantly.",
    keywords: [
      "stamp duty calculator Maharashtra",
      "stamp duty Vasai",
      "registration charges Maharashtra",
      "property registration cost India",
    ],
  };
}

export default function StampDutyCalculatorPage() {
  return (
    <>
      <section className="bg-lavender pt-28 pb-12 lg:pt-36 lg:pb-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
            Free online tool
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            Stamp Duty Calculator — Maharashtra
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            Estimate the stamp duty and registration you&apos;ll pay when buying
            a property in Vasai West or Vasai East.
          </p>
        </div>
      </section>

      <StampDutyCalculator />

      {/* SEO content block */}
      <section className="bg-white pb-16 lg:pb-20">
        <div className="mx-auto max-w-4xl px-5 lg:px-8">
          <h2 className="text-2xl font-bold text-navy">
            Stamp Duty Rates in Maharashtra (2026)
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm text-muted">
              <thead>
                <tr className="border-b border-ink/10 text-left">
                  <th className="py-3 pr-4 font-semibold text-ink">Buyer</th>
                  <th className="py-3 pr-4 font-semibold text-ink">
                    Municipal Area
                  </th>
                  <th className="py-3 font-semibold text-ink">
                    Rural / Gram Panchayat
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-ink/5">
                  <td className="py-3 pr-4">Male / Joint (male)</td>
                  <td className="py-3 pr-4">5%</td>
                  <td className="py-3">4%</td>
                </tr>
                <tr className="border-b border-ink/5">
                  <td className="py-3 pr-4">Female / Joint (female primary)</td>
                  <td className="py-3 pr-4">4%</td>
                  <td className="py-3">3%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Registration fees are a flat <strong>1% of the property value</strong>{" "}
            in Maharashtra, subject to a cap. Actual figures depend on the
            ready-reckoner (circle) rate of the area, which can be higher than
            the agreement value.
          </p>

          <h2 className="mt-10 text-2xl font-bold text-navy">
            Additional Costs to Budget For
          </h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted sm:text-base">
            <li>
              <strong>Stamp duty &amp; registration</strong> — usually split
              50/50 between buyer and seller (negotiable with the developer).
            </li>
            <li>
              <strong>GST</strong> on applicable under-construction properties.
            </li>
            <li>
              <strong>Home loan processing fees</strong>, legal verification and
              society transfer charges.
            </li>
          </ul>

          <div className="mt-12 rounded-2xl border border-ink/10 bg-lavender p-6">
            <h3 className="text-lg font-bold text-navy">
              Buying in Vasai? Let us help.
            </h3>
            <p className="mt-2 text-sm text-muted">
              Get honest guidance on verified projects and transparent costs
              from Patang Future Homes.
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