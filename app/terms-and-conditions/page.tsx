import type { Metadata } from "next";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Terms & Conditions",
    description:
      "Read the terms and conditions governing the use of the Patang Future Homes website and services. Please review before using our platform.",
    alternates: { canonical: "/terms-and-conditions" },
    robots: { index: false, follow: true },
  };
}

export default function TermsAndConditionsPage() {
  return (
    <>
      <section className="bg-lavender pt-28 pb-12 lg:pt-36 lg:pb-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            Terms &amp; Conditions
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted">
            Last updated: September 2026
          </p>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-4xl px-5 py-16 lg:px-8 lg:py-20">
          <div className="prose prose-sm max-w-none space-y-6 text-sm leading-relaxed text-muted sm:text-base">
            <h2 className="text-xl font-bold text-navy">1. Acceptance of Terms</h2>
            <p>
              By accessing and using the Patang Future Homes website (the
              &ldquo;Website&rdquo;) and associated services, you agree to be
              bound by these Terms &amp; Conditions. If you do not agree with any
              part of these terms, please do not use our Website.
            </p>

            <h2 className="text-xl font-bold text-navy">2. About Us</h2>
            <p>
              Patang Future Homes is a Vasai-based property advisory connecting
              property owners with buyers and renters across Vasai West and Vasai
              East. We act as an intermediary and are not the direct builder or
              seller of any listed property unless explicitly stated.
            </p>

            <h2 className="text-xl font-bold text-navy">3. Use of the Website</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>You must be at least 18 years of age to use this Website.</li>
              <li>
                You agree to provide accurate, current and complete information
                when submitting an enquiry.
              </li>
              <li>
                You will not use the Website for any unlawful purpose or to
                transmit spam, malware or any harmful content.
              </li>
              <li>
                We reserve the right to restrict or terminate your access to the
                Website at our discretion, without notice.
              </li>
            </ul>

            <h2 className="text-xl font-bold text-navy">
              4. Property Listings &amp; Information
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                All property details — including pricing, availability, floor
                plans, possession dates, and specifications — are sourced from
                developers and are subject to change without prior notice.
              </li>
              <li>
                Images, renderings and visuals on the Website are for
                illustrative purposes only and may differ from the final product.
              </li>
              <li>
                RERA registration numbers are provided for transparency. You are
                advised to verify all project details directly with the
                respective RERA authority.
              </li>
              <li>
                Patang Future Homes does not guarantee the accuracy or
                completeness of third-party information listed on the Website.
              </li>
            </ul>

            <h2 className="text-xl font-bold text-navy">
              5. Enquiries &amp; Communications
            </h2>
            <p>
              When you submit an enquiry via our Website, WhatsApp, phone or
              other channels, you consent to being contacted by Patang Future
              Homes regarding your property requirements. You may opt out of
              communications at any time by informing us directly.
            </p>

            <h2 className="text-xl font-bold text-navy">6. Intellectual Property</h2>
            <p>
              All content on this Website — including text, images, logos, design
              elements and code — is owned by or licensed to Patang Future Homes
              and is protected under applicable intellectual property laws. You
              may not reproduce, distribute or create derivative works without
              our prior written consent.
            </p>

            <h2 className="text-xl font-bold text-navy">7. Limitation of Liability</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Patang Future Homes acts as an intermediary and is not a party to
                any transaction between a buyer and a developer or seller.
              </li>
              <li>
                We are not liable for any loss, damage or expense arising from
                property transactions, delays by developers, or inaccuracies in
                listed information.
              </li>
              <li>
                Our total liability for any claim arising from use of this
                Website shall not exceed the amount you paid to us, if any, for
                the service giving rise to the claim.
              </li>
            </ul>

            <h2 className="text-xl font-bold text-navy">8. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless Patang Future Homes, its
              team and affiliates from any claims, losses or expenses arising
              from your use of the Website or violation of these Terms.
            </p>

            <h2 className="text-xl font-bold text-navy">9. Links to Third-Party Websites</h2>
            <p>
              Our Website may contain links to external websites. We do not
              endorse or assume responsibility for the content, privacy
              practices or reliability of any third-party sites.
            </p>

            <h2 className="text-xl font-bold text-navy">10. Governing Law</h2>
            <p>
              These Terms are governed by the laws of India. Any disputes
              arising from or relating to these Terms shall be subject to the
              exclusive jurisdiction of the courts in Palghar, Maharashtra.
            </p>

            <h2 className="text-xl font-bold text-navy">11. Changes to These Terms</h2>
            <p>
              We reserve the right to update these Terms &amp; Conditions at any
              time. The revised version will be posted on this page with the
              updated date. Continued use of the Website constitutes acceptance
              of the revised terms.
            </p>

            <h2 className="text-xl font-bold text-navy">12. Contact Us</h2>
            <p>
              For any questions regarding these Terms &amp; Conditions, please
              contact us:
            </p>
            <p>
              <strong>Patang Future Homes</strong>
              <br />
              Vasai West, Maharashtra, India
              <br />
              <a
                href="tel:+919657447246"
                className="text-primary hover:underline"
              >
                +91 96574 47246
              </a>
              <br />
              <a
                href="https://wa.me/919657447246"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                WhatsApp Us
              </a>
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
