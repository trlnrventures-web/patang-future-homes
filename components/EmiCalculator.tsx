"use client";

import { useState, useMemo } from "react";

function emi(principal: number, annualRate: number, months: number): number {
  if (annualRate === 0) return principal / months;
  const r = annualRate / 12 / 100;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

function fmtINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function EmiCalculator() {
  const [loanAmount, setLoanAmount] = useState(5000000);
  const [interestRate, setInterestRate] = useState(8.5);
  const [tenureYears, setTenureYears] = useState(20);

  const result = useMemo(() => {
    const months = tenureYears * 12;
    const monthlyEmi = emi(loanAmount, interestRate, months);
    const totalPayment = monthlyEmi * months;
    const totalInterest = totalPayment - loanAmount;
    return { monthlyEmi, totalInterest, totalPayment, months };
  }, [loanAmount, interestRate, tenureYears]);

  const principalPct =
    result.totalPayment > 0 ? (loanAmount / result.totalPayment) * 100 : 50;

  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
            Free online tool
          </div>
          <h2 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">
            EMI Calculator
          </h2>
          <p className="mt-3 text-sm text-muted sm:text-base">
            Calculate your monthly home loan EMI for any amount, interest rate
            and tenure, instantly and free.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-8 lg:grid-cols-[1fr_1fr]">
          {/* Inputs */}
          <div className="space-y-6">
            <Slider
              label="Loan Amount"
              value={loanAmount}
              onChange={setLoanAmount}
              min={100000}
              max={50000000}
              step={100000}
              format={fmtINR}
            />
            <Slider
              label="Interest Rate (% p.a.)"
              value={interestRate}
              onChange={setInterestRate}
              min={6}
              max={16}
              step={0.1}
              format={(v) => `${v}%`}
            />
            <Slider
              label="Loan Tenure (Years)"
              value={tenureYears}
              onChange={setTenureYears}
              min={1}
              max={30}
              step={1}
              format={(v) => `${v} yrs`}
            />
          </div>

          {/* Results */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl bg-primary p-6 text-white shadow-lg shadow-primary/20">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
                Monthly EMI
              </span>
              <div className="mt-1 text-3xl font-bold">
                {fmtINR(result.monthlyEmi)}
              </div>
              <p className="mt-1 text-xs text-white/60">
                over {result.months} months ({tenureYears} years)
              </p>
            </div>

            <ResultRow label="Principal Amount" value={fmtINR(loanAmount)} />
            <ResultRow
              label="Total Interest Payable"
              value={fmtINR(result.totalInterest)}
            />
            <ResultRow
              label="Total Payment"
              value={fmtINR(result.totalPayment)}
            />

            {/* Breakdown */}
            <div className="mt-2">
              <div className="mb-2 flex items-center justify-between text-xs text-muted">
                <span>Principal: {principalPct.toFixed(0)}%</span>
                <span>Interest: {(100 - principalPct).toFixed(0)}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${principalPct}%` }}
                />
              </div>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-soft">
              * Estimates only. Actual EMI depends on the lender&apos;s terms,
              processing fees and your credit profile.
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