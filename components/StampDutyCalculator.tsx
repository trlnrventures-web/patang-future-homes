"use client";

import { useState, useMemo } from "react";

function fmtINR(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

type Gender = "male" | "female";
type Area = "municipal" | "rural";

const STAMP_DUTY: Record<Gender, Record<Area, number>> = {
  male: { municipal: 0.05, rural: 0.04 },
  female: { municipal: 0.04, rural: 0.03 },
};

const REGISTRATION_FEE = 0.01;

export default function StampDutyCalculator() {
  const [propertyValue, setPropertyValue] = useState(5000000);
  const [gender, setGender] = useState<Gender>("male");
  const [area, setArea] = useState<Area>("municipal");

  const result = useMemo(() => {
    const stampDuty = propertyValue * STAMP_DUTY[gender][area];
    const registration = propertyValue * REGISTRATION_FEE;
    const total = stampDuty + registration;
    return { stampDuty, registration, total };
  }, [propertyValue, gender, area]);

  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
            Free online tool
          </div>
          <h2 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">
            Stamp Duty Calculator
          </h2>
          <p className="mt-3 text-sm text-muted sm:text-base">
            Estimate the stamp duty and registration charges you will pay on a
            property in Maharashtra (applicable for Vasai West &amp; Vasai East).
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-8 lg:grid-cols-[1fr_1fr]">
          {/* Inputs */}
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted">
                  Property Value
                </span>
                <span className="text-sm font-bold text-ink">
                  {fmtINR(propertyValue)}
                </span>
              </div>
              <input
                type="range"
                min={100000}
                max={100000000}
                step={100000}
                value={propertyValue}
                onChange={(e) => setPropertyValue(Number(e.target.value))}
                className="mt-2 w-full accent-primary"
              />
              <div className="mt-0.5 flex justify-between text-[10px] text-soft">
                <span>₹1L</span>
                <span>₹10 Cr</span>
              </div>
            </div>

            <div>
              <span className="text-sm font-medium text-muted">Buyer</span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    ["male", "Male"],
                    ["female", "Female"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setGender(key)}
                    className={`rounded-full border py-2.5 text-sm font-semibold transition-colors ${
                      gender === key
                        ? "border-primary bg-primary text-white"
                        : "border-ink/10 bg-background text-muted hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-soft">
                Women buyers enjoy lower stamp duty rates in Maharashtra.
              </p>
            </div>

            <div>
              <span className="text-sm font-medium text-muted">
                Property Location
              </span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    ["municipal", "Municipal Area"],
                    ["rural", "Rural / Gram Panchayat"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setArea(key)}
                    className={`rounded-full border py-2.5 text-sm font-semibold transition-colors ${
                      area === key
                        ? "border-primary bg-primary text-white"
                        : "border-ink/10 bg-background text-muted hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="flex flex-col gap-4">
            <ResultsRow
              label="Stamp Duty"
              rate={`${(STAMP_DUTY[gender][area] * 100).toFixed(0)}%`}
              value={fmtINR(result.stampDuty)}
            />
            <ResultsRow
              label="Registration Fee"
              rate="1%"
              value={fmtINR(result.registration)}
            />
            <div className="rounded-2xl bg-primary p-6 text-white shadow-lg shadow-primary/20">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
                Total Cost
              </span>
              <div className="mt-1 text-3xl font-bold">
                {fmtINR(result.total)}
              </div>
              <p className="mt-1 text-xs text-white/60">
                Payable at the time of registration
              </p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-soft">
              * Estimates based on current Maharashtra stamp duty rates. Actual
              charges may vary based on circle rates, ready reckoner rates and
              government notifications.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ResultsRow({
  label,
  rate,
  value,
}: {
  label: string;
  rate: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white p-5">
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wider text-muted">
          {label}
        </span>
        <span className="mt-0.5 inline-block rounded-full bg-lavender px-2 py-0.5 text-[11px] font-bold text-primary">
          {rate}
        </span>
      </div>
      <span className="text-lg font-bold text-ink">{value}</span>
    </div>
  );
}