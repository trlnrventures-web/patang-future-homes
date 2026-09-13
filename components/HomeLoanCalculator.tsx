"use client";

import { useState, useMemo } from "react";

function emi(principal: number, annualRate: number, months: number): number {
  if (annualRate === 0) return principal / months;
  const r = annualRate / 12 / 100;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

function loanAmount(emiAmount: number, annualRate: number, months: number): number {
  if (annualRate === 0) return emiAmount * months;
  const r = annualRate / 12 / 100;
  return (emiAmount * (Math.pow(1 + r, months) - 1)) / (r * Math.pow(1 + r, months));
}

function fmtINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

type Tab = "eligibility" | "emi";

export default function HomeLoanCalculator() {
  const [tab, setTab] = useState<Tab>("eligibility");

  // Eligibility inputs
  const [monthlyIncome, setMonthlyIncome] = useState(80000);
  const [existingEmi, setExistingEmi] = useState(0);
  const [interestRate, setInterestRate] = useState(8.5);
  const [tenureYears, setTenureYears] = useState(20);

  // EMI inputs
  const [loanAmountInput, setLoanAmountInput] = useState(5000000);
  const [emiInterestRate, setEmiInterestRate] = useState(8.5);
  const [emiTenureYears, setEmiTenureYears] = useState(20);

  // Eligibility results
  const eligibility = useMemo(() => {
    const maxEmiPct = 0.4;
    const maxEmi = monthlyIncome * maxEmiPct - existingEmi;
    const months = tenureYears * 12;
    const maxLoan = maxEmi > 0 ? loanAmount(maxEmi, interestRate, months) : 0;
    const totalInterest = maxEmi > 0 ? maxEmi * months - maxLoan : 0;
    const totalPayment = maxLoan + totalInterest;
    return {
      maxEmi: Math.max(0, maxEmi),
      maxLoan: Math.max(0, maxLoan),
      totalInterest: Math.max(0, totalInterest),
      totalPayment: Math.max(0, totalPayment),
      months,
    };
  }, [monthlyIncome, existingEmi, interestRate, tenureYears]);

  // EMI results
  const emiResult = useMemo(() => {
    const months = emiTenureYears * 12;
    const monthlyEmi = emi(loanAmountInput, emiInterestRate, months);
    const totalPayment = monthlyEmi * months;
    const totalInterest = totalPayment - loanAmountInput;
    return { monthlyEmi, totalInterest, totalPayment, months };
  }, [loanAmountInput, emiInterestRate, emiTenureYears]);

  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-ink">
            Free online tool
          </div>
          <h2 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">
            Home Loan Calculator
          </h2>
          <p className="mt-3 text-sm text-muted sm:text-base">
            Check how much you can borrow or calculate your monthly EMI — instant,
            free and without any obligation.
          </p>
        </div>

        {/* Tab bar */}
        <div className="mx-auto mt-10 flex max-w-md overflow-hidden rounded-full border border-ink/10 bg-background p-1">
          {([["eligibility", "Eligibility"], ["emi", "EMI Calculator"]] as const).map(
            ([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex-1 rounded-full py-2.5 text-sm font-semibold transition-colors ${
                  tab === key
                    ? "bg-primary text-white shadow"
                    : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            )
          )}
        </div>

        {/* Eligibility tab */}
        {tab === "eligibility" && (
          <div className="mx-auto mt-10 grid max-w-5xl gap-8 lg:grid-cols-[1fr_1fr]">
            {/* Inputs */}
            <div className="space-y-6">
              <SliderField
                label="Monthly Income (Take Home)"
                value={monthlyIncome}
                onChange={setMonthlyIncome}
                min={20000}
                max={1000000}
                step={5000}
                format={fmtINR}
              />
              <SliderField
                label="Existing Monthly EMIs"
                value={existingEmi}
                onChange={setExistingEmi}
                min={0}
                max={200000}
                step={1000}
                format={fmtINR}
              />
              <SliderField
                label="Interest Rate (% p.a.)"
                value={interestRate}
                onChange={setInterestRate}
                min={6}
                max={16}
                step={0.1}
                format={(v) => `${v}%`}
              />
              <SliderField
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
              <ResultCard
                label="Maximum Loan Amount"
                value={fmtINR(eligibility.maxLoan)}
                highlight
              />
              <ResultCard
                label="Maximum Affordable EMI"
                value={fmtINR(eligibility.maxEmi)}
              />
              <ResultCard
                label="Total Interest Payable"
                value={fmtINR(eligibility.totalInterest)}
              />
              <ResultCard
                label="Total Payment"
                value={fmtINR(eligibility.totalPayment)}
              />
              <div className="mt-2 rounded-2xl bg-lavender p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-primary">
                  Property Tip
                </p>
                <p className="mt-1 text-sm text-muted">
                  Your max eligible loan of <strong>{fmtINR(eligibility.maxLoan)}</strong> at{" "}
                  {interestRate}% p.a. over {tenureYears} years keeps your EMI
                  within 40% of your take-home income — a safe threshold
                  recommended by financial advisors.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* EMI tab */}
        {tab === "emi" && (
          <div className="mx-auto mt-10 grid max-w-5xl gap-8 lg:grid-cols-[1fr_1fr]">
            {/* Inputs */}
            <div className="space-y-6">
              <SliderField
                label="Loan Amount"
                value={loanAmountInput}
                onChange={setLoanAmountInput}
                min={100000}
                max={50000000}
                step={100000}
                format={fmtINR}
              />
              <SliderField
                label="Interest Rate (% p.a.)"
                value={emiInterestRate}
                onChange={setEmiInterestRate}
                min={6}
                max={16}
                step={0.1}
                format={(v) => `${v}%`}
              />
              <SliderField
                label="Loan Tenure (Years)"
                value={emiTenureYears}
                onChange={setEmiTenureYears}
                min={1}
                max={30}
                step={1}
                format={(v) => `${v} yrs`}
              />
            </div>

            {/* Results */}
            <div className="flex flex-col gap-4">
              <ResultCard
                label="Monthly EMI"
                value={fmtINR(emiResult.monthlyEmi)}
                highlight
              />
              <ResultCard
                label="Principal Amount"
                value={fmtINR(loanAmountInput)}
              />
              <ResultCard
                label="Total Interest Payable"
                value={fmtINR(emiResult.totalInterest)}
              />
              <ResultCard
                label="Total Payment"
                value={fmtINR(emiResult.totalPayment)}
              />
              {/* Breakdown bar */}
              <div className="mt-2">
                <div className="mb-2 flex items-center justify-between text-xs text-muted">
                  <span>Principal</span>
                  <span>Interest</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-ink/10">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{
                      width: `${emiResult.totalPayment > 0 ? (loanAmountInput / emiResult.totalPayment) * 100 : 50}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── Small helpers ─── */

function SliderField({
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

function ResultCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-5 ${
        highlight
          ? "bg-primary text-white shadow-lg shadow-primary/20"
          : "border border-ink/10 bg-white"
      }`}
    >
      <span
        className={`text-xs font-semibold uppercase tracking-wider ${
          highlight ? "text-white/70" : "text-muted"
        }`}
      >
        {label}
      </span>
      <div
        className={`mt-1 text-2xl font-bold ${
          highlight ? "text-white" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
