const STATS = [
  { value: "500+", label: "Properties Sold" },
  { value: "15+", label: "Years Experience" },
  { value: "1000+", label: "Happy Families" },
  { value: "90%+", label: "Client Referrals" },
];

export default function Stats() {
  return (
    <section className="bg-primary py-16 text-white lg:py-20">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <p className="mx-auto max-w-xl text-center text-sm font-medium uppercase tracking-widest text-white/50">
          Trusted Real Estate Developers in India
        </p>

        <div className="mt-10 grid grid-cols-2 gap-10 lg:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <span className="mx-auto block h-0.5 w-10 rounded-full bg-accent" />
              <div className="mt-4 font-display text-3xl font-bold sm:text-4xl lg:text-5xl">
                {stat.value}
              </div>
              <div className="mt-2 text-sm text-white/60">{stat.label}</div>
            </div>
          ))}
        </div>

        <p className="mt-12 text-center text-sm text-white/40">
          Serving buyers, sellers, and renters across Vasai West and Vasai
          East, with honesty and transparency.
        </p>
      </div>
    </section>
  );
}