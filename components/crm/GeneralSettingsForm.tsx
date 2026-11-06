"use client";

import { useEffect, useState } from "react";
import { BUDGET_RANGE_DEFS, DEFAULT_BUDGET_RANGE_KEYS } from "@/lib/crm/budget";

type Weights = {
  subLocation: number;
  location: number;
  budget: number;
  budgetPartial: number;
};

const DEFAULT_WEIGHTS: Weights = { subLocation: 40, location: 20, budget: 25, budgetPartial: 10 };

/** Ladder of "no response" attempts; each is the wait before the next attempt. */
const RESPONSE_STEPS: { step: number; label: string }[] = [
  { step: 1, label: "Attempt 1" },
  { step: 2, label: "Attempt 2" },
  { step: 3, label: "Attempt 3" },
  { step: 4, label: "Attempt 4" },
  { step: 5, label: "Attempt 5" },
];

const DEFAULT_SCHEDULE: Record<number, number> = { 1: 0, 2: 240, 3: 1440, 4: 4320, 5: 10080 };

const input =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-primary";

function minutesToHuman(mins: number): string {
  if (mins <= 0) return "immediately";
  if (mins < 60) return `${mins} min`;
  if (mins % 1440 === 0) return `${mins / 1440} day${mins / 1440 === 1 ? "" : "s"}`;
  if (mins % 60 === 0) return `${mins / 60} hr`;
  return `${Math.floor(mins / 60)} hr ${mins % 60} min`;
}

/**
 * Editor for the lead-rules settings that previously had no screen: the SLA
 * timer, the property-matching weights, the no-response ladder and the budget
 * chips. Loaded and saved through `/crm/api/settings`, which validates every
 * field server-side.
 */
export default function GeneralSettingsForm() {
  const [sla, setSla] = useState("5");
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [schedule, setSchedule] = useState<Record<number, number>>(DEFAULT_SCHEDULE);
  const [budgetKeys, setBudgetKeys] = useState<string[]>(DEFAULT_BUDGET_RANGE_KEYS);
  const [stretch, setStretch] = useState("10");
  const [dailyCap, setDailyCap] = useState("3");
  const [nurtureLimit, setNurtureLimit] = useState("20");
  const [cadence, setCadence] = useState("2, 5, 10, 20");
  const [reminderHour, setReminderHour] = useState("10");
  const [overdueHour, setOverdueHour] = useState("18");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/crm/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d?.settings) return;
        const s = d.settings as Record<string, string>;
        if (s.sla_first_response_min) setSla(s.sla_first_response_min);
        try {
          if (s.matching_weights) setWeights({ ...DEFAULT_WEIGHTS, ...JSON.parse(s.matching_weights) });
        } catch {
          /* keep defaults */
        }
        try {
          if (s.no_response_schedule) {
            const parsed = JSON.parse(s.no_response_schedule) as Record<string, number>;
            const next: Record<number, number> = {};
            for (const { step } of RESPONSE_STEPS) {
              next[step] = Number(parsed[step] ?? parsed[String(step)] ?? DEFAULT_SCHEDULE[step]);
            }
            setSchedule(next);
          }
        } catch {
          /* keep defaults */
        }
        try {
          if (s.budget_ranges) {
            const keys = (JSON.parse(s.budget_ranges) as string[]).filter((k) => k in BUDGET_RANGE_DEFS);
            if (keys.length) setBudgetKeys(keys);
          }
        } catch {
          /* keep defaults */
        }
        if (s.budget_stretch_pct) setStretch(s.budget_stretch_pct);
        if (s.daily_visit_cap) setDailyCap(s.daily_visit_cap);
        if (s.nurture_daily_task_limit) setNurtureLimit(s.nurture_daily_task_limit);
        if (s.post_visit_cadence) {
          try {
            const days = JSON.parse(s.post_visit_cadence) as number[];
            if (Array.isArray(days)) setCadence(days.join(", "));
          } catch {
            /* keep default */
          }
        }
        if (s.visit_reminder_hour_ist) setReminderHour(s.visit_reminder_hour_ist);
        if (s.visit_reminder_overdue_hour_ist) setOverdueHour(s.visit_reminder_overdue_hour_ist);
      })
      .catch(() => setErr("Could not load settings."))
      .finally(() => setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const weightTotal = weights.subLocation + weights.location + weights.budget + weights.budgetPartial;

  const toggleBudget = (key: string) => {
    setBudgetKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  async function save() {
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/crm/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sla_first_response_min: Number(sla),
          matching_weights: weights,
          no_response_schedule: schedule,
          budget_ranges: budgetKeys,
          budget_stretch_pct: Number(stretch),
          daily_visit_cap: Number(dailyCap),
          nurture_daily_task_limit: Number(nurtureLimit),
          post_visit_cadence: cadence
            .split(",")
            .map((d) => Number(d.trim()))
            .filter((n) => Number.isFinite(n) && n > 0),
          visit_reminder_hour_ist: Number(reminderHour),
          visit_reminder_overdue_hour_ist: Number(overdueHour),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || "Could not save.");
        return;
      }
      setMsg("Saved. Changes apply to new activity from now on.");
    } catch {
      setErr("Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="py-6 text-sm text-muted">Loading...</p>;

  return (
    <div className="space-y-6">
      {/* SLA */}
      <section>
        <h2 className="text-sm font-bold text-navy">First-response SLA</h2>
        <p className="mt-0.5 text-xs text-muted">
          How long a caller has to make the first call before a new lead is flagged overdue.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={120}
            value={sla}
            onChange={(e) => setSla(e.target.value)}
            className={`${input} max-w-[8rem]`}
          />
          <span className="text-sm text-muted">minutes</span>
        </div>
      </section>

      {/* Matching weights */}
      <section>
        <h2 className="text-sm font-bold text-navy">Property matching weights</h2>
        <p className="mt-0.5 text-xs text-muted">
          How much each factor counts when ranking properties for a lead. Must total 100 or less.
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["subLocation", "Sub-location match"],
              ["location", "Location match"],
              ["budget", "Budget match"],
              ["budgetPartial", "Partial budget overlap"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-muted">{label}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={weights[key]}
                onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) || 0 }))}
                className={input}
              />
            </label>
          ))}
        </div>
        <p className={`mt-1.5 text-xs font-semibold ${weightTotal > 100 ? "text-red-700" : "text-muted"}`}>
          Total: {weightTotal}
        </p>
      </section>

      {/* No-response ladder */}
      <section>
        <h2 className="text-sm font-bold text-navy">No-response follow-up ladder</h2>
        <p className="mt-0.5 text-xs text-muted">
          Wait before each next attempt once a lead stops responding. Minutes from the previous attempt.
        </p>
        <div className="mt-2 space-y-2">
          {RESPONSE_STEPS.map(({ step, label }) => (
            <div key={step} className="flex items-center gap-2">
              <span className="w-24 text-xs font-semibold text-muted">{label}</span>
              <input
                type="number"
                min={0}
                value={schedule[step] ?? 0}
                onChange={(e) => setSchedule((s) => ({ ...s, [step]: Number(e.target.value) || 0 }))}
                className={`${input} max-w-[8rem]`}
              />
              <span className="text-xs text-muted">min — {minutesToHuman(schedule[step] ?? 0)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Budget chips */}
      <section>
        <h2 className="text-sm font-bold text-navy">Budget ranges</h2>
        <p className="mt-0.5 text-xs text-muted">
          The quick-pick chips shown when editing a lead&apos;s budget.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {DEFAULT_BUDGET_RANGE_KEYS.map((key) => {
            const on = budgetKeys.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleBudget(key)}
                aria-pressed={on}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                  on
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-white text-muted hover:border-primary/40 hover:text-primary"
                }`}
              >
                {BUDGET_RANGE_DEFS[key].label}
              </button>
            );
          })}
        </div>
        {budgetKeys.length === 0 && (
          <p className="mt-1.5 text-xs text-amber-700">
            Pick at least one range, otherwise the built-in defaults are used.
          </p>
        )}
      </section>

      {/* Vasai West conversion */}
      <section className="rounded-xl border border-border bg-slate-50 p-3">
        <h2 className="text-sm font-bold text-navy">Vasai West conversion rules</h2>
        <p className="mt-0.5 text-xs text-muted">
          Budget stretch, SM load caps, nurture limits and the visit reminder clock.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted">Budget stretch below lowest unit (%)</span>
            <input
              type="number"
              min={0}
              max={50}
              value={stretch}
              onChange={(e) => setStretch(e.target.value)}
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted">Daily visits per SM (cap)</span>
            <input
              type="number"
              min={1}
              max={50}
              value={dailyCap}
              onChange={(e) => setDailyCap(e.target.value)}
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted">Nurture tasks per caller per day</span>
            <input
              type="number"
              min={1}
              max={200}
              value={nurtureLimit}
              onChange={(e) => setNurtureLimit(e.target.value)}
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted">Post-visit cadence (days, comma separated)</span>
            <input
              value={cadence}
              onChange={(e) => setCadence(e.target.value)}
              className={input}
              placeholder="2, 5, 10, 20"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted">Day-before reminder time (IST hour)</span>
            <input
              type="number"
              min={0}
              max={23}
              value={reminderHour}
              onChange={(e) => setReminderHour(e.target.value)}
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted">Overdue cutoff for the Sales Head (IST hour)</span>
            <input
              type="number"
              min={0}
              max={23}
              value={overdueHour}
              onChange={(e) => setOverdueHour(e.target.value)}
              className={input}
            />
          </label>
        </div>
      </section>

      {msg && <p className="text-xs font-semibold text-green-700">{msg}</p>}
      {err && <p className="text-xs font-semibold text-red-700">{err}</p>}
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-secondary disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save lead rules"}
      </button>
    </div>
  );
}
