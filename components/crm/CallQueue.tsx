"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, PhoneIcon, WhatsAppIcon } from "./ui";
import { formatPhoneForWhatsApp } from "@/lib/crm/messages";
import { LEAD_STATUS_LABELS } from "@/lib/crm/leads";
import { autoFollowUpMs, istLocalInputToMs, istLocalInputValue, nextCallingDayStartMs } from "@/lib/crm/call-schedule";
import type { CallQueueItem } from "@/app/crm/api/call-queue/route";

const OUTCOMES: { key: string; label: string; cls: string; hint: string }[] = [
  { key: "connected", label: "Connected", cls: "bg-emerald-100 text-emerald-800", hint: "Follow-up suggested tomorrow" },
  { key: "no_answer", label: "No Answer", cls: "bg-amber-100 text-amber-800", hint: "Next calling morning — edit to pick another day" },
  { key: "busy", label: "Busy", cls: "bg-orange-100 text-orange-800", hint: "Next calling morning — edit to pick another day" },
  { key: "call_back", label: "Call Back", cls: "bg-sky-100 text-sky-800", hint: "Time told by the customer" },
  { key: "not_interested", label: "Not Interested", cls: "bg-indigo-100 text-indigo-800", hint: "Nurture follow-up in 30 days" },
  { key: "wrong_number", label: "Wrong Number", cls: "bg-red-100 text-red-700", hint: "Lead will be marked invalid" },
];

function formatDateTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function localInputToIso(value: string): string {
  const ms = istLocalInputToMs(value);
  return Number.isNaN(ms) ? "" : new Date(ms).toISOString();
}

/**
 * Machine-picked follow-up times.
 *
 * Every suggestion is guaranteed to land on a *later* day than the call, so a
 * lead worked today never re-enters today's queue. The field is prefilled, not
 * locked: typing a time in by hand schedules exactly that moment, same day
 * included.
 */
function suggestFollowUpMs(outcome: string): string {
  const now = Date.now();
  switch (outcome) {
    case "connected":
      return istLocalInputValue(autoFollowUpMs(24 * 60, now));
    case "busy":
    case "no_answer":
      return istLocalInputValue(nextCallingDayStartMs(now));
    case "call_back":
      // Prefilled so the required field is never empty, but the caller is
      // expected to replace it with the time the customer actually named.
      return istLocalInputValue(nextCallingDayStartMs(now));
    case "not_interested":
      return istLocalInputValue(autoFollowUpMs(30 * 24 * 60, now));
    default:
      return "";
  }
}

type Props = {
  onExit: () => void;
};

export default function CallQueue({ onExit }: Props) {
  const [queue, setQueue] = useState<CallQueueItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<typeof OUTCOMES[number] | null>(null);
  const [followUp, setFollowUp] = useState("");
  const [note, setNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/crm/api/call-queue");
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        if (cancelled) return;
        setQueue(data.queue || []);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("Could not load the queue.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const item = queue[idx];

  const openOutcome = useCallback(
    (o: (typeof OUTCOMES)[number]) => {
      setApiError("");
      setOutcome(o);
      setNote("");
      setShowHistory(false);
      setFollowUp(suggestFollowUpMs(o.key));
    },
    []
  );

  const confirmOutcome = useCallback(async () => {
    if (!item || !outcome) return;
    const followUpIso = outcome.key === "wrong_number" ? "" : localInputToIso(followUp);
    if (outcome.key === "call_back" && !followUpIso) {
      setApiError("A follow-up time is required for a call back.");
      return;
    }
    setSubmitting(true);
    setApiError("");
    try {
      const payload: Record<string, unknown> = { type: outcome.key, notes: note };
      if (outcome.key === "call_back") {
        payload.callbackTime = followUpIso;
      } else if (followUpIso) {
        payload.scheduledFollowUp = followUpIso;
      }
      const res = await fetch(`/crm/api/leads/${item.id}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "failed");
      }
      setOutcome(null);
      setIdx((i) => i + 1);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Could not log the call. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [item, outcome, followUp, note]);

  const phone = item ? (item.whatsappNumber || item.phone || "").replace(/\D/g, "") : "";
  const waNumber = item ? formatPhoneForWhatsApp(item.whatsappNumber || item.phone) : "";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-navy text-white">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold">📞 CALL QUEUE</span>
          {queue.length > 0 && (
            <Badge color="bg-white/15 text-white">
              {Math.min(idx + 1, queue.length)} of {queue.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full bg-emerald-400 transition-all"
              style={{
                width: queue.length ? `${(Math.min(idx, queue.length - 1) / (queue.length - 1 || 1)) * 100}%` : "0%",
              }}
            />
          </div>
          <button
            onClick={onExit}
            className="rounded-xl border border-white/20 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-white/10"
          >
            EXIT QUEUE
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="mx-auto max-w-lg space-y-3 py-10">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/10" />
            ))}
          </div>
        ) : error ? (
          <div className="mx-auto max-w-lg rounded-2xl bg-white/10 p-6 text-center text-sm">
            {error}
            <div className="mt-3">
              <Button onClick={onExit}>BACK TO DASHBOARD</Button>
            </div>
          </div>
        ) : !item ? (
          <div className="mx-auto max-w-lg rounded-2xl bg-white/10 p-8 text-center">
            <div className="text-3xl">🎉</div>
            <p className="mt-2 text-sm font-semibold">Queue complete! All leads have been worked.</p>
            <p className="mt-1 text-xs text-white/60">Today&apos;s queue is clear. Great work!</p>
            <div className="mt-4">
              <Button onClick={onExit}>BACK TO DASHBOARD</Button>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-lg space-y-4">
            {/* Lead card */}
            <div className="rounded-2xl bg-white p-5 text-navy">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold">{item.name}</h2>
                  <a href={`tel:+${phone}`} className="mt-0.5 block text-sm font-semibold text-primary">
                    {item.phone}
                  </a>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge color="bg-primary/10 text-primary">{item.priorityGroup.replace("_", " ")}</Badge>
                  <Badge color="bg-background text-muted">{LEAD_STATUS_LABELS[item.status] || item.status}</Badge>
                  <Badge color="bg-background text-muted">{item.leadAge}</Badge>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                {item.requirementLines.map((r, i) => (
                  <span key={i} className="rounded-md bg-background px-1.5 py-0.5 text-muted">
                    {r}
                  </span>
                ))}
                {item.attemptCount > 0 && (
                  <span className="rounded-md bg-background px-1.5 py-0.5 text-muted">
                    Attempts: {item.attemptCount}
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <a
                  href={`tel:+${phone}`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-white"
                >
                  <PhoneIcon /> CALL
                </a>
                <a
                  href={`https://wa.me/${waNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-2.5 text-xs font-bold text-white"
                >
                  <WhatsAppIcon /> WHATSAPP
                </a>
              </div>

              {item.pastNotes.length > 0 && (
                <div className="mt-3 rounded-xl border border-border bg-background p-3 text-navy">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-semibold">Last note: </span>
                    <span className="min-w-0 flex-1 text-xs">{item.lastNote}</span>
                  </div>

                  {item.pastNotes.length > 1 && (
                    <>
                      <button
                        onClick={() => setShowHistory((s) => !s)}
                        className="mt-2 text-[11px] font-bold uppercase tracking-wide text-primary"
                      >
                        {showHistory
                          ? "Hide past conversation"
                          : `Show past conversation (${item.pastNotes.length})`}
                      </button>
                      {showHistory && (
                        <div className="mt-2 max-h-56 space-y-2 overflow-y-auto border-t border-border pt-2">
                          {item.pastNotes.map((n) => (
                            <div key={n.id}>
                              <div className="text-[10px] font-semibold text-muted">
                                {n.label} · {n.userName} · {formatDateTime(n.createdAt)}
                              </div>
                              <div className="text-xs text-navy">{n.notes}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Outcome picker */}
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/60">
                Log outcome
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {OUTCOMES.map((o) => (
                  <button
                    key={o.key}
                    onClick={() => openOutcome(o)}
                    className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors ${
                      outcome?.key === o.key
                        ? "border-white bg-white text-navy"
                        : "border-white/15 bg-white/5 text-white hover:bg-white/10"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Outcome confirmation */}
            {outcome && (
              <div className="rounded-2xl bg-white p-4 text-navy">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold">{outcome.label}</h4>
                  <button onClick={() => setOutcome(null)} className="text-xs font-semibold text-muted">
                    Cancel ✕
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-muted">{outcome.hint}</p>

                {outcome.key !== "wrong_number" && (
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-semibold text-muted">
                      Next follow-up (auto-suggested, editable) · IST
                    </label>
                    <input
                      type="datetime-local"
                      required={outcome.key === "call_back"}
                      value={followUp}
                      onChange={(e) => setFollowUp(e.target.value)}
                      className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {outcome.key === "wrong_number" && (
                  <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                    Confirming will mark the lead as invalid.
                  </p>
                )}
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-semibold text-muted">Note (optional)</label>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Short summary of the call..."
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                  />
                </div>

                {apiError && (
                  <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                    {apiError}
                  </p>
                )}

                <div className="mt-3 flex gap-2">
                  <Button
                    disabled={submitting}
                    onClick={confirmOutcome}
                    className="flex-1"
                  >
                    {submitting ? "SAVING..." : `SAVE · ${outcome.label.toUpperCase()}`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}