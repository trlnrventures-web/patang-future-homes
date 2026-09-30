"use client";

import { useEffect, useState } from "react";

type Tier = { threshold: number; rate: number };
type Ladder = { key: "sm" | "caller"; label: string; tiers: Tier[]; capped: boolean };
type Ladders = { sm: Ladder; caller: Ladder };

const ROLES: Array<{ key: "sm" | "caller"; title: string; blurb: string }> = [
  {
    key: "sm",
    title: "Sales Manager",
    blurb: "Paid per confirmed booking the SM is assigned to.",
  },
  {
    key: "caller",
    title: "Caller",
    blurb: "Paid per booking attributed to the lead's assigned caller.",
  },
];

const rs = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * Rate-card editor.
 *
 * The ladder is retroactive: crossing a threshold revalues every booking the
 * person has that month, so the threshold column is "from N bookings onward"
 * rather than a range. Tiers are kept in ascending threshold order here so the
 * saved payload is what the reader expects; the server re-sorts and de-dups
 * regardless, so a reordered or hand-edited payload cannot produce a bad rate.
 */
export default function IncentiveLadderForm() {
  const [ladders, setLadders] = useState<Ladders | null>(null);
  const [defaults, setDefaults] = useState<Ladders | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/crm/api/incentives/ladders", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active || !d?.ladders) return;
        setLadders(d.ladders);
        setDefaults(d.defaults ?? null);
      })
      .catch(() => setErr("Could not load incentive rates."));
    return () => {
      active = false;
    };
  }, []);

  function updateTier(role: "sm" | "caller", index: number, patch: Partial<Tier>) {
    setLadders((prev) => {
      if (!prev) return prev;
      const tiers = prev[role].tiers.map((t, i) => (i === index ? { ...t, ...patch } : t));
      return { ...prev, [role]: { ...prev[role], tiers } };
    });
  }

  function addTier(role: "sm" | "caller") {
    setLadders((prev) => {
      if (!prev) return prev;
      const tiers = [...prev[role].tiers].sort((a, b) => a.threshold - b.threshold);
      const last = tiers[tiers.length - 1];
      const threshold = last ? last.threshold + 1 : 1;
      // Seed the rate from the last tier so the new row is never a surprise
      // revalue of the tier below it.
      const rate = last ? last.rate : 0;
      return { ...prev, [role]: { ...prev[role], tiers: [...tiers, { threshold, rate }] } };
    });
  }

  function removeTier(role: "sm" | "caller", index: number) {
    setLadders((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [role]: { ...prev[role], tiers: prev[role].tiers.filter((_, i) => i !== index) },
      };
    });
  }

  function resetToDefaults() {
    if (!defaults) return;
    setLadders(defaults);
    setMsg("");
    setErr("");
  }

  async function save() {
    if (!ladders) return;
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/crm/api/incentives/ladders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ladders }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Could not save.");
        return;
      }
      setLadders(data.ladders);
      setMsg("Saved. New rates apply to every month from now on.");
    } catch {
      setErr("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  if (!ladders) {
    return (
      <p className="rounded-xl bg-background px-3 py-6 text-center text-sm text-soft">
        {err || "Loading incentive rates..."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-background/60 p-3 text-[11px] leading-relaxed text-muted">
        Rates are <strong className="text-navy">retroactive</strong>: when a person
        crosses a threshold, every booking they earned that month is revalued at
        the new rate, earlier bookings included. The threshold is the number of
        bookings <em>from which</em> that rate applies. Changing a rate affects
        months that have not been paid yet; amounts already marked paid stay as
        they were.
      </div>

      {ROLES.map(({ key, title, blurb }) => {
        const tiers = [...ladders[key].tiers].sort((a, b) => a.threshold - b.threshold);
        const capped = ladders[key].capped;
        const top = tiers[tiers.length - 1];
        return (
          <div key={key} className="rounded-xl border border-border bg-white p-4">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold text-primary">{title}</div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                <input
                  type="checkbox"
                  checked={capped}
                  onChange={(e) =>
                    setLadders((prev) =>
                      prev ? { ...prev, [key]: { ...prev[key], capped: e.target.checked } } : prev
                    )
                  }
                  className="h-3.5 w-3.5 accent-[var(--color-primary)]"
                />
                Capped at the top tier
              </label>
            </div>
            <p className="mb-3 text-[11px] text-soft">{blurb}</p>

            <div className="space-y-1.5">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1 text-[10px] font-bold uppercase tracking-wide text-soft">
                <span>From this many</span>
                <span>Amount each</span>
                <span />
              </div>
              {tiers.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={t.threshold}
                    onChange={(e) => updateTier(key, i, { threshold: Number(e.target.value) })}
                    className="w-full rounded-lg border border-border px-2.5 py-2 text-sm"
                    aria-label={`${title}: bookings threshold for tier ${i + 1}`}
                  />
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={t.rate}
                    onChange={(e) => updateTier(key, i, { rate: Number(e.target.value) })}
                    className="w-full rounded-lg border border-border px-2.5 py-2 text-sm"
                    aria-label={`${title}: rate for tier ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeTier(key, i)}
                    disabled={tiers.length <= 1}
                    className="rounded-lg border border-border px-2 py-2 text-xs font-bold text-red-600 disabled:opacity-30"
                    aria-label={`Remove ${title} tier ${i + 1}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => addTier(key)}
                className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-primary"
              >
                + Add tier
              </button>
              {top && (
                <span className="text-[11px] text-soft">
                  {capped
                    ? `Top tier ${rs(top.rate)} each, from ${top.threshold}+`
                    : `No cap - above ${top.threshold} it stays ${rs(top.rate)}`}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {err && <p className="text-xs font-semibold text-red-600">{err}</p>}
      {msg && <p className="text-xs font-semibold text-green-700">{msg}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-secondary disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save rates"}
        </button>
        <button
          type="button"
          onClick={resetToDefaults}
          disabled={!defaults || saving}
          className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-muted transition-colors hover:bg-background disabled:opacity-60"
        >
          Revert to shipped defaults
        </button>
      </div>
    </div>
  );
}
