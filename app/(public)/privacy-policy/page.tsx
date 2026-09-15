import type { Metadata } from "next";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Privacy Policy",
    description:
      "Read the privacy policy of Patang Future Homes, how we collect, use and protect your personal information when you browse or use our services.",
    alternates: { canonical: "/privacy-policy" },
    robots: { index: false, follow: true },
  };
}

export default function PrivacyPolicyPage() {
  return (
    <>
      <section className="bg-lavender pt-28 pb-12 lg:pt-36 lg:pb-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted">
            Last updated: September 2026
          </p>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-4xl px-5 py-16 lg:px-8 lg:py-20">
          <div className="prose prose-sm max-w-none space-y-6 text-sm leading-relaxed text-muted sm:text-base">
            <h2 className="text-xl font-bold text-navy">Introduction</h2>
            <p>
              Welcome to Patang Future Homes. We respect your privacy and are
              committed to protecting the personal information you share with
              us. This Privacy Policy explains how we collect, use, store and
              safeguard your data when you visit our website or use our services.
            </p>

            <h2 className="text-xl font-bold text-navy">
              Information We Collect
            </h2>
            <p>We may collect the following types of information:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Personal Information:</strong> Name, phone number, email
                address, and property preferences submitted through enquiry
                forms, WhatsApp, or phone calls.
              </li>
              <li>
                <strong>Usage Data:</strong> Pages viewed, time spent on the
                site, referral source, and general browsing behaviour collected
                automatically.
              </li>
              <li>
                <strong>Device Data:</strong> Browser type, operating system,
                IP address and device identifiers.
              </li>
            </ul>

            <h2 className="text-xl font-bold text-navy">
              How We Use Your Information
            </h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Respond to your property enquiries and provide consultation.</li>
              <li>
                Send property updates, project notifications and marketing
                communications (only if you opt in).
              </li>
              <li>
                Improve our website, services and user experience.
              </li>
              <li>
                Comply with legal and regulatory requirements.
              </li>
            </ul>

            <h2 className="text-xl font-bold text-navy">Data Sharing</h2>
            <p>
              We do <strong>not sell or rent</strong> your personal information
              to third parties. We may share your data with:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Our partner developers, only when you express specific interest
                in a project.
              </li>
              <li>
                Service providers who assist us in operating our website
                (e.g., hosting, analytics), bound by confidentiality
                obligations.
              </li>
              <li>
                Legal authorities, when required by law or to protect our
                rights.
              </li>
            </ul>

            <h2 className="text-xl font-bold text-navy">
              Cookies & Tracking
            </h2>
            <p>
              Our website may use cookies and similar technologies to enhance
              your browsing experience and collect usage analytics. You can
              control or disable cookies through your browser settings.
            </p>

            <h2 className="text-xl font-bold text-navy">Data Security</h2>
            <p>
              We implement reasonable security measures to protect your personal
              data from unauthorised access, alteration, disclosure or
              destruction. However, no method of transmission over the internet
              is 100% secure, and we cannot guarantee absolute security.
            </p>

            <h2 className="text-xl font-bold text-navy">Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Access the personal information we hold about you.</li>
              <li>Request correction or deletion of your data.</li>
              <li>Opt out of marketing communications at any time.</li>
            </ul>

            <h2 className="text-xl font-bold text-navy">
              Third-Party Links
            </h2>
            <p>
              Our website may contain links to third-party websites (e.g.,
              project developer sites, Google Maps). We are not responsible for
              the privacy practices of these external sites.
            </p>

            <h2 className="text-xl font-bold text-navy">
              Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will
              be posted on this page with the updated date.
            </p>

            <h2 className="text-xl font-bold text-navy">Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy, please
              contact us:
            </p>
            <p>
              <strong>Patang Future Homes</strong>
              <br />
              Vasai West, Maharashtra, India
              <br />
              <a
                href="tel:+917249138197"
                className="text-primary hover:underline"
              >
                +91 72491 38197
              </a>
              <br />
              <a
                href="https://wa.me/917249138197"
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
