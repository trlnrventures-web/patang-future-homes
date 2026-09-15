import type { Metadata } from "next";
import InquiryForm from "@/components/InquiryForm";

const PHONE_DISPLAY = "+91 72491 38197";
const PHONE_TEL = "tel:+917249138197";
const WHATSAPP_LINK = "https://wa.me/917249138197";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Contact Us | Vasai West & East Property Experts",
    description:
      "Get in touch with Patang Future Homes. Call, WhatsApp, or send an enquiry, and our Vasai West & East property experts are here to help you find the right home or investment.",
    keywords: [
      "contact Patang Future Homes",
      "property enquiry Vasai",
      "real estate agents Vasai West",
      "site visit Vasai",
    ],
    alternates: {
      canonical: "/contact",
    },
    openGraph: {
      type: "website",
      title: "Contact Patang Future Homes | Vasai Property Experts",
      description:
        "Call, WhatsApp or send an enquiry to Patang Future Homes, Vasai West & East property experts here to help you find the right home or investment.",
      url: "/contact",
      images: [
        {
          url: "/og-image.jpg",
          width: 1200,
          height: 630,
          alt: "Contact Patang Future Homes in Vasai West",
        },
      ],
    },
  };
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lavender text-primary">
        {icon}
      </span>
      <div>
        <h3 className="text-xs font-bold uppercase tracking-widest text-soft">
          {label}
        </h3>
        <div className="mt-1 text-base font-medium text-navy">{children}</div>
      </div>
    </div>
  );
}

const CALL_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
  >
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const WHATSAPP_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="h-5 w-5"
  >
    <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
  </svg>
);

const PIN_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
  >
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const CLOCK_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export default function ContactPage() {
  return (
    <>
      <section className="bg-lavender pt-28 pb-12 lg:pt-36 lg:pb-14">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            Get in Touch
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted">
            Have a question about a property? We&apos;re here to help.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 pb-16 pt-10 lg:px-8 lg:pb-24">
        <div className="grid gap-8 lg:grid-cols-[7fr_5fr] lg:items-start">
          {/* Left: enquiry form */}
          <div className="rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold tracking-tight text-navy">
              Send an Enquiry
            </h2>
            <p className="mt-1 text-sm text-muted">
              We&apos;ll respond via WhatsApp within a few hours.
            </p>
            <div className="mt-6">
              <InquiryForm />
            </div>
          </div>

          {/* Right: contact info card */}
          <div className="rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold tracking-tight text-navy">
              Contact Information
            </h2>
            <div className="mt-6 flex flex-col gap-6">
              <InfoRow icon={CALL_ICON} label="Phone">
                <a
                  href={PHONE_TEL}
                  className="font-bold text-navy transition-colors hover:text-primary"
                >
                  {PHONE_DISPLAY}
                </a>
              </InfoRow>

              <InfoRow icon={WHATSAPP_ICON} label="WhatsApp">
                <a
                  href={WHATSAPP_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-navy transition-colors hover:text-primary"
                >
                  {PHONE_DISPLAY}
                </a>
              </InfoRow>

              <InfoRow icon={PIN_ICON} label="Office">
                <p className="font-medium text-muted">
                  Vasai West, Maharashtra, India
                  <span className="block text-xs font-normal text-soft">
                    Office address coming soon
                  </span>
                </p>
              </InfoRow>

              <InfoRow icon={CLOCK_ICON} label="Business Hours">
                <p className="font-medium text-muted">
                  Mon – Sat, 10:00 AM – 7:00 PM
                  <span className="block text-xs font-normal text-soft">
                    Site visits available on Sundays by appointment
                  </span>
                </p>
              </InfoRow>
            </div>
          </div>
        </div>

        {/* Google Maps embed */}
        <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          <iframe
            title="Patang Future Homes, serving Vasai West & Vasai East, Maharashtra"
            src="https://maps.google.com/maps?q=Vasai%20West%2C%20Maharashtra&z=12&output=embed"
            className="h-[360px] w-full border-0"
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </>
  );
}