import Link from "next/link";

const FOOTER_LINKS = [
  {
    heading: "Properties",
    links: [
      { href: "/projects?type=shop", label: "Shops" },
      { href: "/projects?type=flat", label: "Flats" },
      { href: "/projects?type=bungalow", label: "Bungalows" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About Us" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    heading: "Tools",
    links: [
      { href: "/home-loan-calculator", label: "Home Loan Eligibility" },
      { href: "/emi-calculator", label: "EMI Calculator" },
      { href: "/stamp-duty-calculator", label: "Stamp Duty Calculator" },
      { href: "/rent-vs-buy-calculator", label: "Rent vs Buy Calculator" },
      { href: "/roi-calculator", label: "ROI Calculator" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacy-policy", label: "Privacy Policy" },
      { href: "/terms-and-conditions", label: "Terms & Conditions" },
      { href: "/disclaimer", label: "Disclaimer" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative mt-auto bg-primary text-white">
      {/* Skyline silhouette */}
      <div className="absolute bottom-0 left-0 right-0 overflow-hidden leading-[0]">
        <svg
          viewBox="0 0 1440 100"
          preserveAspectRatio="none"
          className="relative block h-[60px] w-full"
        >
          <path
            d="M0,100 L0,70 L40,70 L40,55 L55,55 L55,35 L65,35 L65,25 L75,25 L75,35 L85,35 L85,55 L120,55 L120,60 L160,60 L160,45 L175,45 L175,30 L185,30 L185,15 L195,15 L195,30 L205,30 L205,45 L240,45 L240,55 L280,55 L280,40 L300,40 L300,50 L330,50 L330,35 L345,35 L345,20 L355,20 L355,10 L365,10 L365,20 L375,20 L375,35 L400,35 L400,50 L440,50 L440,60 L480,60 L480,45 L500,45 L500,30 L510,30 L510,18 L520,18 L520,30 L530,30 L530,45 L560,45 L560,55 L600,55 L600,40 L620,40 L620,50 L660,50 L660,35 L675,35 L675,22 L685,22 L685,12 L695,12 L695,22 L705,22 L705,35 L740,35 L740,50 L780,50 L780,55 L820,55 L820,40 L840,40 L840,28 L850,28 L850,15 L860,15 L860,28 L870,28 L870,40 L900,40 L900,50 L940,50 L940,60 L980,60 L980,45 L1000,45 L1000,32 L1010,32 L1010,20 L1020,20 L1020,32 L1030,32 L1030,45 L1060,45 L1060,55 L1100,55 L1100,42 L1120,42 L1120,55 L1160,55 L1160,60 L1200,60 L1200,48 L1220,48 L1220,35 L1230,35 L1230,22 L1240,22 L1240,35 L1250,35 L1250,48 L1280,48 L1280,58 L1320,58 L1320,50 L1350,50 L1350,60 L1400,60 L1400,65 L1440,65 L1440,100 Z"
            fill="var(--color-background)"
          />
        </svg>
      </div>

      <div className="mx-auto max-w-7xl px-5 pb-24 pt-16 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-6">
          {/* Brand lockup */}
          <div className="lg:col-span-2 lg:pr-10">
            <div className="flex flex-col leading-none">
              <span className="font-display text-2xl font-bold tracking-wide">
                PATANG
              </span>
              <span className="text-[11px] font-medium uppercase tracking-[0.3em] text-white/50">
                Future Homes
              </span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
              Your trusted real estate partner in Vasai West. We help you find
              the perfect property — from premium flats to luxury bungalows and
              commercial spaces.
            </p>
          </div>

          {/* Link columns */}
          {FOOTER_LINKS.map((group) => (
            <div key={group.heading}>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">
                {group.heading}
              </h4>
              <ul className="flex flex-col gap-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/70 transition-colors hover:text-accent"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <p className="mt-12 max-w-5xl text-xs leading-relaxed text-white/40">
          Disclaimer: The information on this platform, including property
          listings, project details, and pricing, is for general informational
          purposes only. While we strive for accuracy, we make no warranties
          about the completeness or reliability of any content. Users should
          independently verify all information before making any purchasing or
          investment decisions. This platform does not constitute an offer or
          recommendation to buy or sell property. We disclaim any liability for
          loss or damage arising from use of or reliance on this information.
          All trademarks, logos, and images belong to their respective owners
          and are used for identification purposes only.
        </p>

        {/* Contact row */}
        <div className="mt-6 flex flex-col gap-4 border-t border-white/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1 text-sm text-white/50">
            <a
              href="tel:+919657447246"
              className="transition-colors hover:text-accent"
            >
              +91 96574 47246
            </a>
            <span>Vasai West, Maharashtra, India</span>
          </div>
          <p className="text-xs text-white/30">
            &copy; {new Date().getFullYear()} Patang Future Homes. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
