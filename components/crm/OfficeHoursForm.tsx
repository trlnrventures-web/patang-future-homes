"use client";

import { useEffect, useState } from "react";

const DAY_LABELS = [
  { value: 1, short: "Mon" },
  { value: 2, short: "Tue" },
  { value: 3, short: "Wed" },
  { value: 4, short: "Thu" },
  { value: 5, short: "Fri" },
  { value: 6, short: "Sat" },
  { value: 0, short: "Sun" },
];

const WEEK_OFF_OPTIONS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

type Hours = {
  days: number[];
  startMin: number;
  endMin: number;
  enabled: boolean;
  weekOffDay: string;
};

const toTime = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const fromTime = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return (Number.isFinite(h) ? h : 10) * 60 + (Number.isFinite(m) ? m : 0);
};

/**
 * Office hours editor. The window here is what decides when lead contact
 * details are masked, so it is config in `crm_settings`, not hardcoded, and only
 * admin/owner can change it.
 */
export default function OfficeHoursForm() {
  const [hours, setHours] = useState<Hours | null>(null);
  const [withinHours, setWithinHours] = useState<boolean | null>(null);
  const [weekOffToday, setWeekOffToday] = useState(false);
  const [workingWeekOff, setWorkingWeekOff] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/crm/api/office-hours", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d) return;
        setWithinHours(!!d.withinOfficeHours);
        setWeekOffToday(!!d.isWeekOff);
        setWorkingWeekOff(!!d.workingWeekOff);
        setBanner(d.banner ?? null);
        if (d.hours?.startMin != null) setHours({ weekOffDay: "Tuesday", ...d.hours });
      })
      .catch(() => setErr("Could not load office hours."));
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    if (!hours) return;
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/crm/api/office-hours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hours),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Could not save.");
        return;
      }
      setHours(data.hours);
      setBanner(data.banner ?? null);
      setMsg("Saved. Masking applies immediately.");
    } catch {
      setErr("Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (!hours) {
    return <p className="py-6 text-sm text-muted">{err || "Loading..."}</p>;
  }

  const toggleDay = (d: number) => {
    setHours((h) =>
      h
        ? {
            ...h,
            days: h.days.includes(d) ? h.days.filter((x) => x !== d) : [...h.days, d],
          }
        : h
    );
  };

  const wraps = hours.endMin <= hours.startMin;

  return (
    <div className="space-y-5">
      <div
        className={`rounded-xl border px-3 py-2.5 text-xs font-semibold ${
          weekOffToday
            ? "border-amber-300 bg-amber-50 text-amber-900"
            : withinHours
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-amber-300 bg-amber-50 text-amber-900"
        }`}
      >
        {banner
          ? banner
          : weekOffToday
            ? workingWeekOff
              ? `Today is your ${hours.weekOffDay} week-off, but you are checked in - contact details are visible.`
              : `Today is the ${hours.weekOffDay} week-off. Contacts stay masked all day unless you check in and work it.`
            : withinHours
              ? "Currently inside office hours - lead contact details are visible to staff."
              : "Currently outside office hours - lead contact details are masked for Caller and Sales Manager roles."}
      </div>

      <label className="flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={hours.enabled}
          onChange={(e) => setHours({ ...hours, enabled: e.target.checked })}
          className="h-4 w-4 accent-primary"
        />
        <span className="text-sm font-semibold text-navy">
          Mask contact details outside these hours
        </span>
      </label>

      <div>
        <div className="mb-1.5 text-xs font-bold text-navy">Working days</div>
        <div className="flex flex-wrap gap-1.5">
          {DAY_LABELS.map((d) => {
            const on = hours.days.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                aria-pressed={on}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  on
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-white text-muted hover:border-primary/40 hover:text-primary"
                }`}
              >
                {d.short}
              </button>
            );
          })}
        </div>
        {hours.days.length === 0 && (
          <p className="mt-1.5 text-xs text-amber-700">
            With no days selected, everything is treated as outside office hours,
            so staff numbers stay masked all week.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label
            className="mb-1.5 block text-xs font-bold text-navy"
            htmlFor="oh-start"
          >
            Start (IST)
          </label>
          <input
            id="oh-start"
            type="time"
            value={toTime(hours.startMin)}
            onChange={(e) => setHours({ ...hours, startMin: fromTime(e.target.value) })}
            className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-primary"
          />
        </div>
        <div>
          <label
            className="mb-1.5 block text-xs font-bold text-navy"
            htmlFor="oh-end"
          >
            End (IST)
          </label>
          <input
            id="oh-end"
            type="time"
            value={toTime(hours.endMin)}
            onChange={(e) => setHours({ ...hours, endMin: fromTime(e.target.value) })}
            className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-primary"
          />
        </div>
      </div>

      {wraps && (
        <p className="text-xs text-amber-700">
          The end time is earlier than the start, so this is treated as an
          overnight window running past midnight into the next working day.
        </p>
      )}

      {/* Week-off. On this day contacts stay masked all day for Caller and SM
          roles unless the person checks in, so opting to cover the office does
          not cost you the ability to do the job. */}
      <div className="rounded-xl border border-border bg-background/40 p-3">
        <label
          className="mb-1.5 block text-xs font-bold text-navy"
          htmlFor="oh-weekoff"
        >
          Week-off day
        </label>
        <select
          id="oh-weekoff"
          value={hours.weekOffDay}
          onChange={(e) => setHours({ ...hours, weekOffDay: e.target.value })}
          className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-primary"
        >
          {WEEK_OFF_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <p className="mt-2 text-[11px] text-muted">
          On {hours.weekOffDay}, lead contact details are masked for Caller and
          Sales Manager roles for the whole day &mdash; even inside the hours
          above. Anyone checked in and working that day keeps full access.
          Admin and Owner are never masked.
        </p>
        {hours.days.includes(2) && hours.weekOffDay === "Tuesday" && (
          <p className="mt-2 text-[11px] text-amber-700">
            Tuesday is also ticked as a working day. The week-off rule wins, so
            Tuesday will still be masked &mdash; untick it to keep the two in
            agreement.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-xs text-muted">
        Admin and Owner roles always see full numbers and full emails, at any
        hour, and are never masked. Any full-number reveal is written to the
        audit log and to the lead&apos;s activity history.
      </div>

      {msg && <p className="text-xs font-semibold text-green-700">{msg}</p>}
      {err && <p className="text-xs font-semibold text-red-700">{err}</p>}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-secondary disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save office hours"}
      </button>
    </div>
  );
}
