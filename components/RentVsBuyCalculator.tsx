"use client";

import { useState, useMemo } from "react";

function emi(principal: number, annualRate: number, months: number): number {
  if (annualRate === 0) return principal / months;
  const r = annualRate / 12 / 100;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

function fmtINR(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function fmtCrOrLac(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return fmtINR(n);
}

export default function RentVsBuyCalculator() {
  const [monthlyRent, setMonthlyRent] = useState(25000);
  const [propertyValue, setPropertyValue] = useState(6000000);
  const [downPayment, setDownPayment] = useState(1500000);
  const [interestRate, setInterestRate] = useState(8.5);
  const [appreciation, setAppreciation] = useState(5);
  const [rentIncrease, setRentIncrease] = useState(5);
  const [years, setYears] = useState(10);

  const result = useMemo(() => {
    const months = years * 12;
    const loanAmount = Math.max(0, propertyValue - downPayment);
    const monthlyEmi = emi(loanAmount, interestRate, months);

    const futureValue = propertyValue * Math.pow(1 + appreciation / 100, years);
    const totalEmiPaid = monthlyEmi * months;
    const totalBuyingCost = downPayment + totalEmiPaid;

    const principalAfterMonths =
      loanAmount * Math.pow(1 + interestRate / 12 / 100, months) - totalEmiPaid;
    const remainingLoan = Math.max(0, principalAfterMonths);
    const buyNetWorth = futureValue - remainingLoan;

    // Renter: invests the down payment and any EMI excess over rent at ~6% p.a.
    const monthlyEmiExcess = Math.max(0, monthlyEmi - monthlyRent);
    const annualRents: number[] = [];
    let rentPaid = 0;
    for (let y = 0; y < years; y++) {
      const yearRent =
        monthlyRent * 12 * Math.pow(1 + rentIncrease / 100, y);
      annualRents.push(yearRent);
      rentPaid += yearRent;
    }

    let value = downPayment * Math.pow(1.06, years);
    for (let y = 0; y < years; y++) {
      const contribution = annualRents[y] + monthlyEmiExcess * 12;
      value += contribution * Math.pow(1.06, years - 1 - y);
    }
    const rentNetWorth = value - rentPaid;

    const buyBetter = buyNetWorth >= rentNetWorth;

    return {
      monthlyEmi,
      totalBuyingCost,
      totalRentPaid: rentPaid,
      buyNetWorth,
      rentNetWorth,
      buyBetter,
      futureValue,
    };
  }, [monthlyRent, propertyValue, downPayment, interestRate, appreciation, rentIncrease, years]);

  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
            Free online tool
          </div>
          <h2 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">
            Rent vs Buy Calculator
          </h2>
          <p className="mt-3 text-sm text-muted sm:text-base">
            Compare the long-term cost of renting against buying a home in Vasai
            , so you can decide what makes financial sense for you.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-8 lg:grid-cols-[1fr_1fr]">
          {/* Inputs */}
          <div className="space-y-6">
            <Slider
              label="Monthly Rent"
              value={monthlyRent}
              onChange={setMonthlyRent}
              min={5000}
              max={200000}
              step={1000}
              format={fmtINR}
            />
            <Slider
              label="Property Value"
              value={propertyValue}
              onChange={setPropertyValue}
              min={1000000}
              max={50000000}
              step={500000}
              format={fmtCrOrLac}
            />
            <Slider
              label="Down Payment / Own Funds"
              value={downPayment}
              onChange={setDownPayment}
              min={0}
              max={10000000}
              step={100000}
              format={fmtCrOrLac}
            />
            <Slider
              label="Home Loan Interest Rate (% p.a.)"
              value={interestRate}
              onChange={setInterestRate}
              min={6}
              max={16}
              step={0.1}
              format={(v) => `${v}%`}
            />
            <Slider
              label="Expected Appreciation (% p.a.)"
              value={appreciation}
              onChange={setAppreciation}
              min={0}
              max={15}
              step={0.5}
              format={(v) => `${v}%`}
            />
            <Slider
              label="Annual Rent Increase (% p.a.)"
              value={rentIncrease}
              onChange={setRentIncrease}
              min={0}
              max={15}
              step={0.5}
              format={(v) => `${v}%`}
            />
            <Slider
              label="Time Horizon (Years)"
              value={years}
              onChange={setYears}
              min={1}
              max={30}
              step={1}
              format={(v) => `${v} yrs`}
            />
          </div>

          {/* Results */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white p-5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Monthly EMI (if buying)
              </span>
              <span className="text-lg font-bold text-ink">
                {fmtINR(result.monthlyEmi)}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white p-5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Total Rent Paid
              </span>
              <span className="text-lg font-bold text-ink">
                {fmtCrOrLac(result.totalRentPaid)}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white p-5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Total Cost of Buying
              </span>
              <span className="text-lg font-bold text-ink">
                {fmtCrOrLac(result.totalBuyingCost)}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white p-5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Home Value After {years} Years
              </span>
              <span className="text-lg font-bold text-ink">
                {fmtCrOrLac(result.futureValue)}
              </span>
            </div>

            <div className="py-1" />

            {/* Verdict */}
            <div
              className={`rounded-2xl p-6 text-white shadow-lg ${
                result.buyBetter
                  ? "bg-primary shadow-primary/20"
                  : "bg-secondary shadow-secondary/20"
              }`}
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
                Recommendation
              </span>
              <div className="mt-1 text-2xl font-bold">
                {result.buyBetter ? "Buying wins here!" : "Renting wins here!"}
              </div>
              <p className="mt-2 text-sm text-white/85">
                {result.buyBetter
                  ? `Over ${years} years, buying leaves you with a home plus equity worth roughly ${fmtCrOrLac(
                      result.buyNetWorth
                    )}, more than renting would give back.`
                  : `Over ${years} years, renting and investing the difference leaves you better off than owning this property.`}
              </p>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-soft">
              * Estimates only, assuming savings grow at ~6% p.a. and ignoring
              maintenance, taxes and one-time purchase costs for simplicity.
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