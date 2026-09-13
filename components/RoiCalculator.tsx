"use client";

import { useState, useMemo } from "react";

function fmtINR(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function fmtCrOrLac(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return fmtINR(n);
}

export default function RoiCalculator() {
  const [purchasePrice, setPurchasePrice] = useState(5000000);
  const [monthlyRent, setMonthlyRent] = useState(20000);
  const [appreciation, setAppreciation] = useState(5);
  const [years, setYears] = useState(10);
  const [expensesPct, setExpensesPct] = useState(10);

  const result = useMemo(() => {
    const annualRent = monthlyRent * 12;
    const annualExpenses = (annualRent * expensesPct) / 100;
    const netAnnualRent = annualRent - annualExpenses;
    const rentalYield = (netAnnualRent / purchasePrice) * 100;
    const futureValue = purchasePrice * Math.pow(1 + appreciation / 100, years);
    const capitalGain = futureValue - purchasePrice;
    const totalRentReceived = netAnnualRent * years;
    const totalReturn = capitalGain + totalRentReceived;
    const totalRoi = (totalReturn / purchasePrice) * 100;
    const annualRoi = Math.pow(1 + totalRoi / 100, 1 / years) - 1;

    return {
      annualRent,
      annualExpenses,
      netAnnualRent,
      rentalYield,
      futureValue,
      capitalGain,
      totalRentReceived,
      totalReturn,
      totalRoi,
      annualRoi: annualRoi * 100,
    };
  }, [purchasePrice, monthlyRent, appreciation, years, expensesPct]);

  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
            Free online tool
          </div>
          <h2 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">
            Property ROI Calculator
          </h2>
          <p className="mt-3 text-sm text-muted sm:text-base">
            Estimate the return on your property investment from rental income
            and capital appreciation over time.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-8 lg:grid-cols-[1fr_1fr]">
          {/* Inputs */}
          <div className="space-y-6">
            <Slider
              label="Purchase Price"
              value={purchasePrice}
              onChange={setPurchasePrice}
              min={1000000}
              max={50000000}
              step={500000}
              format={fmtCrOrLac}
            />
            <Slider
              label="Monthly Rent Received"
              value={monthlyRent}
              onChange={setMonthlyRent}
              min={0}
              max={200000}
              step={1000}
              format={fmtINR}
            />
            <Slider
              label="Property Appreciation (% p.a.)"
              value={appreciation}
              onChange={setAppreciation}
              min={0}
              max={15}
              step={0.5}
              format={(v) => `${v}%`}
            />
            <Slider
              label="Holding Period (Years)"
              value={years}
              onChange={setYears}
              min={1}
              max={30}
              step={1}
              format={(v) => `${v} yrs`}
            />
            <Slider
              label="Maintenance & Other Expenses (% of rent)"
              value={expensesPct}
              onChange={setExpensesPct}
              min={0}
              max={30}
              step={1}
              format={(v) => `${v}%`}
            />
          </div>

          {/* Results */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl bg-primary p-6 text-white shadow-lg shadow-primary/20">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
                Total Return on Investment
              </span>
              <div className="mt-1 text-3xl font-bold">
                {result.totalRoi.toFixed(1)}%
              </div>
              <p className="mt-1 text-xs text-white/60">
                ~{result.annualRoi.toFixed(1)}% average annually over {years} years
              </p>
            </div>

            <ResultRow
              label="Rental Yield (Net)"
              value={`${result.rentalYield.toFixed(2)}%`}
            />
            <ResultRow
              label="Annual Rent (Net)"
              value={fmtINR(result.netAnnualRent)}
            />
            <ResultRow
              label="Capital Gain"
              value={fmtCrOrLac(result.capitalGain)}
            />
            <ResultRow
              label="Total Rent Received"
              value={fmtCrOrLac(result.totalRentReceived)}
            />
            <ResultRow
              label="Value After {years} Years"
              value={fmtCrOrLac(result.futureValue)}
            />

            <p className="mt-2 text-xs leading-relaxed text-soft">
              * Estimates only, assuming consistent rent, appreciation and
              expenses. Excludes stamp duty, registration, loan interest and
              capital gains tax.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted">{label}</span>
        <span className="text-sm font-bold text-ink">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-primary"
      />
      <div className="mt-0.5 flex justify-between text-[10px] text-soft">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white p-5">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
      </span>
      <span className="text-lg font-bold text-ink">{value}</span>
    </div>
  );
}