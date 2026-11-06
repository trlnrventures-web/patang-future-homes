"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The Vasai West conversion panel.
 *
 * Everything the caller needs on one screen: the A/B/C grade, the internal
 * pitched project, the visit confirmation gate that reveals the project, the
 * post-visit outcome, and the nurture reply. It talks to the lead's activity
 * endpoint, so every action lands in the same audit trail as the rest of the CRM.
 */

const inputCls =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-primary";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted";

const TIMELINES = [
  { value: "immediate", label: "Immediate" },
  { value: "1_3_months", label: "1–3 months" },
  { value: "3_6_months", label: "3–6 months" },
  { value: "6_plus_months", label: "6+ months" },
  { value: "exploring", label: "Exploring" },
];

const INTENTS = [
  { value: "not_asked", label: "Not asked yet" },
  { value: "yes", label: "Yes — will give a day" },
  { value: "maybe", label: "Maybe — checking with family" },
  { value: "no", label: "No — details on WhatsApp" },
];

const FUNDING = [
  { value: "", label: "Not captured" },
  { value: "self_funded", label: "Self-funded" },
  { value: "loan", label: "Loan" },
  { value: "not_sure", label: "Not sure" },
];

const ATTENDEES = [
  { value: "", label: "Not captured" },
  { value: "self", label: "Self" },
  { value: "spouse", label: "Spouse" },
  { value: "family_together", label: "Family together" },
];

const LOCATIONS = [
  { value: "vasai_west", label: "Vasai West" },
  { value: "vasai_east", label: "Vasai East" },
  { value: "naigaon", label: "Naigaon" },
  { value: "nalasopara", label: "Nalasopara" },
  { value: "virar", label: "Virar" },
  { value: "other", label: "Other" },
];

const GRADE_STYLES: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-800",
  B: "bg-amber-100 text-amber-800",
  C: "bg-slate-200 text-slate-700",
};

const OUTCOMES = [
  { value: "token_paid", label: "Token paid" },
  { value: "second_visit", label: "Second visit booked" },
  { value: "thinking", label: "Thinking" },
  { value: "lost", label: "Lost" },
];

type Props = {
  lead: Record<string, any>;
  visits: any[];
  currentUser: { id: number; role: string; name: string };
  onRefresh: () => void;
  showToast: (message: string) => void;
};

export default function ConversionPanel({ lead, visits, currentUser, onRefresh, showToast }: Props) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<any[]>([]);
  const [gradeInfo, setGradeInfo] = useState<{ grade: string | null; reason: string } | null>(null);
  const [revealReason, setRevealReason] = useState("");
  const [outcomeDraft, setOutcomeDraft] = useState<Record<number, string>>({});
  const [outcomeReason, setOutcomeReason] = useState<Record<number, string>>({});

  const isAdmin = currentUser.role === "admin" || currentUser.role === "sales_head";
  const isSm = currentUser.role === "sales_manager";

  const [form, setForm] = useState({
    location: lead.location || "vasai_west",
    bhk: String(lead.bhk || "").replace(/\D/g, "") || "2",
    budgetMin: lead.budgetMin != null ? String(lead.budgetMin) : "",
    budgetMax: lead.budgetMax != null ? String(lead.budgetMax) : "",
    timeline: lead.timeline || "1_3_months",
    visitIntent: lead.visitIntent || "not_asked",
    fundingStatus: lead.fundingStatus || "",
    visitAttendees: lead.visitAttendees || "",
    pitchedProjectSlug: lead.pitchedProjectSlug || "",
    backupProjectSlug: lead.backupProjectSlug || "",
  });

  useEffect(() => {
    const t = setTimeout(() => {
      setForm({
        location: lead.location || "vasai_west",
        bhk: String(lead.bhk || "").replace(/\D/g, "") || "2",
        budgetMin: lead.budgetMin != null ? String(lead.budgetMin) : "",
        budgetMax: lead.budgetMax != null ? String(lead.budgetMax) : "",
        timeline: lead.timeline || "1_3_months",
        visitIntent: lead.visitIntent || "not_asked",
        fundingStatus: lead.fundingStatus || "",
        visitAttendees: lead.visitAttendees || "",
        pitchedProjectSlug: lead.pitchedProjectSlug || "",
        backupProjectSlug: lead.backupProjectSlug || "",
      });
    }, 0);
    return () => clearTimeout(t);
  }, [lead]);

  const loadOptions = useCallback(async () => {
    try {
      const res = await fetch(`/crm/api/leads/${lead.id}/pitched-projects`);
      if (!res.ok) return;
      const data = await res.json();
      setOptions(data.options || []);
      setGradeInfo(data.gradePreview || null);
      if (!form.pitchedProjectSlug && data.current?.primary) {
        setForm((f) => ({ ...f, pitchedProjectSlug: data.current.primary }));
      }
    } catch {
      // Options are an enhancement; the panel still grades without them.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  useEffect(() => {
    const t = setTimeout(loadOptions, 0);
    return () => clearTimeout(t);
  }, [loadOptions, lead.bhk, lead.budgetMin, lead.budgetMax, lead.location]);

  const act = useCallback(
    async (body: Record<string, unknown>, success: string) => {
      setBusy(true);
      try {
        const res = await fetch(`/crm/api/leads/${lead.id}/activities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(data.error || "Could not save");
          return null;
        }
        showToast(success);
        onRefresh();
        return data;
      } catch {
        showToast("Could not save");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [lead.id, onRefresh, showToast],
  );

  const saveGrade = async () => {
    const data = await act(
      {
        type: "grade",
        location: form.location,
        bhk: form.bhk,
        budgetMin: form.budgetMin ? Number(form.budgetMin) : null,
        budgetMax: form.budgetMax ? Number(form.budgetMax) : null,
        timeline: form.timeline,
        visitIntent: form.visitIntent,
        fundingStatus: form.fundingStatus || null,
        visitAttendees: form.visitAttendees || null,
        pitchedProjectSlug: form.pitchedProjectSlug || null,
        backupProjectSlug: form.backupProjectSlug || null,
      },
      "Grade saved",
    );
    if (data) setGradeInfo({ grade: data.grade, reason: data.reason });
  };

  const confirmVisit = async (visit: any, confirmed: boolean) => {
    await act(
      {
        type: "visit_confirm",
        visitId: visit.id,
        customerConfirmed: confirmed,
        visitDate: visit.date,
        visitTime: visit.time,
        pitchedProjectSlug: form.pitchedProjectSlug || lead.pitchedProjectSlug || null,
      },
      confirmed ? "Visit confirmed — project reveal enabled" : "Confirmation cleared",
    );
  };

  const logOutcome = async (visit: any) => {
    const outcome = outcomeDraft[visit.id];
    if (!outcome) {
      showToast("Pick an outcome first");
      return;
    }
    if (outcome === "lost" && !String(outcomeReason[visit.id] || "").trim()) {
      showToast("A lost reason is required");
      return;
    }
    await act(
      {
        type: "visit_outcome",
        visitId: visit.id,
        outcome,
        reason: outcomeReason[visit.id] || null,
      },
      "Outcome logged",
    );
  };

  const graded = lead.grade as string | null;
  const reveal = lead.revealAllowed === true;

  const liveVisits = useMemo(
    () =>
      [...visits]
        .filter((v) => v.status !== "cancelled")
        .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))
        .slice(0, 4),
    [visits],
  );

  const selected = options.find((o) => o.projectSlug === form.pitchedProjectSlug);

  return (
    <section className="mt-6 rounded-xl border border-border bg-white">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-sm font-bold text-navy">Vasai West conversion</span>
          {graded ? (
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_STYLES[graded] || GRADE_STYLES.C}`}>
              Grade {graded}
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              Not graded
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              reveal ? "bg-indigo-100 text-indigo-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {reveal ? "Project revealed" : "Project hidden"}
          </span>
        </span>
        <span className="text-xs font-semibold text-primary">{open ? "Hide" : "Open"}</span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-border px-4 py-4">
          {lead.gradeReason && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{lead.gradeReason}</p>
          )}
          {!reveal && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Customer templates hide the project name, address and pin until the customer confirms a
              visit. Only the general area (Vasai West) is shared.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={labelCls}>Location</label>
              <select
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                className={inputCls}
              >
                {LOCATIONS.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>BHK</label>
              <select
                value={form.bhk}
                onChange={(e) => setForm((f) => ({ ...f, bhk: e.target.value }))}
                className={inputCls}
              >
                {["1", "2", "3"].map((b) => (
                  <option key={b} value={b}>{b} BHK</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Timeline</label>
              <select
                value={form.timeline}
                onChange={(e) => setForm((f) => ({ ...f, timeline: e.target.value }))}
                className={inputCls}
              >
                {TIMELINES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Budget min (₹L)</label>
              <input
                type="number"
                value={form.budgetMin}
                onChange={(e) => setForm((f) => ({ ...f, budgetMin: e.target.value }))}
                className={inputCls}
                placeholder="e.g. 45"
              />
            </div>
            <div>
              <label className={labelCls}>Budget max (₹L)</label>
              <input
                type="number"
                value={form.budgetMax}
                onChange={(e) => setForm((f) => ({ ...f, budgetMax: e.target.value }))}
                className={inputCls}
                placeholder="e.g. 60"
              />
            </div>
            <div>
              <label className={labelCls}>Visit intent</label>
              <select
                value={form.visitIntent}
                onChange={(e) => setForm((f) => ({ ...f, visitIntent: e.target.value }))}
                className={inputCls}
              >
                {INTENTS.map((i) => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Funding (optional)</label>
              <select
                value={form.fundingStatus}
                onChange={(e) => setForm((f) => ({ ...f, fundingStatus: e.target.value }))}
                className={inputCls}
              >
                {FUNDING.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Who will come for the visit?</label>
              <select
                value={form.visitAttendees}
                onChange={(e) => setForm((f) => ({ ...f, visitAttendees: e.target.value }))}
                className={inputCls}
              >
                {ATTENDEES.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Pitched project (internal)</label>
              <select
                value={form.pitchedProjectSlug}
                onChange={(e) => setForm((f) => ({ ...f, pitchedProjectSlug: e.target.value }))}
                className={inputCls}
              >
                <option value="">Select a project…</option>
                {options.map((o) => (
                  <option key={o.projectSlug} value={o.projectSlug}>
                    {o.level === "strong" ? "BEST" : o.level === "medium" ? "GOOD" : "ALT"} · {o.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Backup project (optional)</label>
              <select
                value={form.backupProjectSlug}
                onChange={(e) => setForm((f) => ({ ...f, backupProjectSlug: e.target.value }))}
                className={inputCls}
              >
                <option value="">None</option>
                {options
                  .filter((o) => o.projectSlug !== form.pitchedProjectSlug)
                  .map((o) => (
                    <option key={o.projectSlug} value={o.projectSlug}>{o.title}</option>
                  ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveGrade}
              disabled={busy}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Save &amp; grade
            </button>
            {gradeInfo && (
              <span className="text-xs text-muted">
                Preview: <strong>{gradeInfo.grade || "needs intent"}</strong> — {gradeInfo.reason}
              </span>
            )}
          </div>

          {selected && (
            <div className="rounded-lg border border-border bg-slate-50 px-3 py-2 text-sm">
              <p className="font-semibold text-navy">
                {selected.title} <span className="text-xs font-normal text-slate-500">({selected.priceRange})</span>
              </p>
              <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
                Internal, do not share with customer
              </p>
            </div>
          )}

          {options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {options.slice(0, 6).map((o) => (
                <button
                  key={o.projectSlug}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, pitchedProjectSlug: o.projectSlug }))}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                    form.pitchedProjectSlug === o.projectSlug
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-white text-navy hover:bg-primary/5"
                  }`}
                >
                  {o.level === "strong" ? "BEST" : o.level === "medium" ? "GOOD" : "ALT"} · {o.title}
                  {o.lowestPriceLakh != null ? ` · ₹${o.lowestPriceLakh.toFixed(1)}L+` : ""}
                </button>
              ))}
            </div>
          )}

          {/* ---- Visits: confirmation, outcome, no-show ---- */}
          <div className="space-y-3 border-t border-border pt-3">
            <h3 className="text-sm font-bold text-navy">Visit gate &amp; outcome</h3>
            {liveVisits.length === 0 && (
              <p className="text-sm text-muted">Book a visit with a date and time to unlock routing and the reveal.</p>
            )}
            {liveVisits.map((visit) => {
              const confirmed = Boolean(visit.customerConfirmed);
              const canLogOutcome = isSm || isAdmin;
              return (
                <div key={visit.id} className="rounded-lg border border-border px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-navy">
                      {visit.date || "No date"} {visit.time ? `· ${visit.time}` : ""} ·{" "}
                      <span className="capitalize">{String(visit.status).replace(/_/g, " ")}</span>
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        confirmed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {confirmed ? "Customer confirmed" : "Not confirmed"}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy || !visit.date || !visit.time}
                      onClick={() => confirmVisit(visit, !confirmed)}
                      className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:bg-primary/5 disabled:opacity-50"
                    >
                      {confirmed ? "Clear confirmation" : "Customer confirmed"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        act({ type: "reminder_done", visitId: visit.id, kind: "day_before" }, "Day-before reminder logged")
                      }
                      className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:bg-primary/5 disabled:opacity-50"
                    >
                      Day-before done
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        act({ type: "reminder_done", visitId: visit.id, kind: "two_hour" }, "Two-hour reminder logged")
                      }
                      className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:bg-primary/5 disabled:opacity-50"
                    >
                      Two-hour done
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act({ type: "visit_no_show", visitId: visit.id }, "Marked no-show; caller gets a rebook task")}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      No-show
                    </button>
                  </div>

                  {canLogOutcome && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        value={outcomeDraft[visit.id] || ""}
                        onChange={(e) => setOutcomeDraft((s) => ({ ...s, [visit.id]: e.target.value }))}
                        className="rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-navy"
                      >
                        <option value="">Log outcome…</option>
                        {OUTCOMES.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      {outcomeDraft[visit.id] === "lost" && (
                        <input
                          value={outcomeReason[visit.id] || ""}
                          onChange={(e) => setOutcomeReason((s) => ({ ...s, [visit.id]: e.target.value }))}
                          placeholder="Lost reason (required)"
                          className="min-w-40 flex-1 rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-navy"
                        />
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => logOutcome(visit)}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Save outcome
                      </button>
                      {visit.outcome && (
                        <span className="text-xs text-muted">
                          Logged: {visit.outcome.replace(/_/g, " ")}
                          {visit.outcomeReason ? ` — ${visit.outcomeReason}` : ""}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {isAdmin && (
            <div className="border-t border-border pt-3">
              <label className={labelCls}>Admin reveal override</label>
              <div className="flex flex-wrap gap-2">
                <input
                  value={revealReason}
                  onChange={(e) => setRevealReason(e.target.value)}
                  placeholder="Reason (required, audited)"
                  className="min-w-48 flex-1 rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy"
                />
                <button
                  type="button"
                  disabled={busy || !revealReason.trim()}
                  onClick={() =>
                    act(
                      { type: "reveal_override", allowed: !reveal, reason: revealReason },
                      reveal ? "Reveal disabled" : "Reveal enabled",
                    )
                  }
                  className="rounded-xl border border-border bg-white px-3 py-2 text-sm font-semibold text-navy hover:bg-primary/5 disabled:opacity-50"
                >
                  {reveal ? "Hide project" : "Reveal project"}
                </button>
              </div>
            </div>
          )}

          {lead.status === "nurture" && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <span className="text-sm font-semibold text-navy">Nurture reply:</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => act({ type: "nurture_contact", responded: true }, "Reply logged — re-grade the lead")}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Positive — re-grade
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => act({ type: "nurture_contact", responded: false }, "No reply logged")}
                className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:bg-primary/5 disabled:opacity-50"
              >
                No reply
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
