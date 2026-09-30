"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, PhoneIcon, WhatsAppIcon } from "./ui";
import { formatPhoneForWhatsApp } from "@/lib/crm/messages";
import { formatCallDuration } from "@/lib/crm/call-sessions-shared";
import { useCallSession } from "./useCallSession";
import {
  autoFollowUpMs,
  istLocalInputToMs,
  istLocalInputValue,
  nextCallingDayStartMs,
} from "@/lib/crm/call-schedule";
import type { CallQueueItem } from "@/app/crm/api/call-queue/route";
import ContactMaskingBanner from "./ContactMaskingBanner";

type Tone = "green" | "grey" | "neutral";

type ContactMasking = {
  active: boolean;
  withinOfficeHours: boolean;
  banner: string | null;
};

type Outcome = {
  key: string;
  label: string;
  /**
   * The activity type the activities route understands. The queue's short
   * `key` exists only to drive this screen's own flow; writing it straight to
   * the API would produce a `connected` activity that no lead-status rule
   * recognises, so the attempt would never be counted.
   */
  activityType: string;
  tone: Tone;
  /** Show the note box in the single step under the buttons. */
  note: boolean;
  /** Show the date/time picker. */
  when: boolean;
  whenLabel: string;
  whenRequired: boolean;
  /** Wrong number marks the lead invalid, so no follow-up is scheduled. */
  schedulesFollowUp: boolean;
};

/** Row 1: Connected | No Answer | Busy. Row 2: Call Back | Not Interested | Wrong Number. */
const OUTCOMES: Outcome[] = [
  {
    key: "connected",
    activityType: "call_connected",
    label: "Connected",
    tone: "green",
    note: true,
    when: true,
    whenLabel: "Next follow-up date",
    whenRequired: true,
    schedulesFollowUp: true,
  },
  {
    key: "no_answer",
    activityType: "call_no_answer",
    label: "No Answer",
    tone: "neutral",
    note: false,
    when: false,
    whenLabel: "",
    whenRequired: false,
    schedulesFollowUp: true,
  },
  {
    key: "busy",
    activityType: "call_busy",
    label: "Busy",
    tone: "neutral",
    note: false,
    when: false,
    whenLabel: "",
    whenRequired: false,
    schedulesFollowUp: true,
  },
  {
    key: "call_back",
    activityType: "call_back",
    label: "Call Back",
    tone: "neutral",
    note: false,
    when: true,
    whenLabel: "Call back at",
    whenRequired: true,
    schedulesFollowUp: true,
  },
  {
    key: "not_interested",
    activityType: "call_not_interested",
    label: "Not Interested",
    tone: "grey",
    note: true,
    when: false,
    whenLabel: "",
    whenRequired: false,
    schedulesFollowUp: true,
  },
  {
    key: "wrong_number",
    activityType: "call_wrong_number",
    label: "Wrong Number",
    tone: "grey",
    note: true,
    when: false,
    whenLabel: "",
    whenRequired: false,
    schedulesFollowUp: false,
  },
];

const TONE_CLS: Record<Tone, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  grey: "border-border bg-white text-muted",
  neutral: "border-border bg-white text-navy",
};

const CARD_MAX = "max-w-[560px]";

function formatNoteTime(iso: string): string {
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
 * Machine-picked follow-up times, prefilled so Save always has something to
 * send. No Answer and Busy are +2 hours from now; the field is not shown for
 * them because the caller did not pick a time. Everything else keeps its
 * existing suggestion.
 */
function suggestFollowUp(outcome: Outcome): string {
  const now = Date.now();
  switch (outcome.key) {
    case "no_answer":
    case "busy":
      // Deliberately not autoFollowUpMs: that rolls a same-day target forward
      // to the next calling morning, and this one is meant to stay at +2h.
      return istLocalInputValue(now + 120 * 60000);
    case "connected":
      return istLocalInputValue(autoFollowUpMs(24 * 60, now));
    case "call_back":
      return istLocalInputValue(nextCallingDayStartMs(now));
    case "not_interested":
      return istLocalInputValue(autoFollowUpMs(30 * 24 * 60, now));
    default:
      return "";
  }
}

type Props = {
  onExit: () => void;
  /** "quality" runs the lead quality lineup instead of the due/overdue queue. */
  mode?: "default" | "quality";
};

export default function CallQueue({ onExit, mode = "default" }: Props) {
  const [queue, setQueue] = useState<CallQueueItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [followUp, setFollowUp] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
const [masking, setMasking] = useState<ContactMasking | null>(null);

  const isQuality = mode === "quality";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(isQuality ? "/crm/api/lead-quality" : "/crm/api/call-queue");
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        if (cancelled) return;
        // The due/overdue queue also returns every active lead that is neither
        // overdue nor due today. Those are not "who do I call next", so that
        // queue is narrowed to the two groups that are actually due. The
        // quality route is already filtered server side, so it is used as is.
        setQueue(
          isQuality
            ? data.queue || []
            : (data.queue || []).filter((q: CallQueueItem) => q.priorityGroup !== "new")
        );
        if (data.contactMasking) setMasking(data.contactMasking);
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
  }, [isQuality]);

  const item = queue[idx];

  // One timed attempt per queue card: opened by the Call tap, closed by the
  // outcome save. Re-anchors itself when the queue advances.
  const { sessionId: callSessionId, elapsed: callElapsed, running: callRunning, begin: beginCall, clear: clearCall } =
    useCallSession(item?.id ?? null, "call_queue");

  const openOutcome = useCallback((o: Outcome) => {
    setApiError("");
    setOutcome(o);
    setNote("");
    setFollowUp(suggestFollowUp(o));
  }, []);

  const resetStep = useCallback(() => {
    setOutcome(null);
    setNote("");
    setFollowUp("");
    setApiError("");
  }, []);

  const saveOutcome = useCallback(async () => {
    if (!item || !outcome) return;
    const followUpIso = localInputToIso(followUp);
    if (outcome.whenRequired && !followUpIso) {
      setApiError(`A ${outcome.whenLabel.toLowerCase()} is required.`);
      return;
    }
    setSubmitting(true);
    setApiError("");
    try {
      const payload: Record<string, unknown> = {
        type: outcome.activityType,
        notes: note,
      };
      if (callSessionId) payload.callSessionId = callSessionId;
      if (outcome.schedulesFollowUp) {
        if (outcome.key === "call_back") {
          payload.callbackTime = followUpIso;
        } else if (followUpIso) {
          payload.scheduledFollowUp = followUpIso;
        }
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
      clearCall();
      resetStep();
      setIdx((i) => i + 1);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Could not log the call. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [item, outcome, followUp, note, resetStep, callSessionId, clearCall]);

  const saveAndNext = useCallback(() => {
    if (submitting) return;
    if (!outcome) {
      // Enter with nothing picked should not fire a request.
      return;
    }
    void saveOutcome();
  }, [outcome, submitting, saveOutcome]);

  // 1-6 pick an outcome, Enter saves and advances. Ignored while typing so a
  // note containing a digit or a newline is never swallowed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      if (e.key >= "1" && e.key <= "6") {
        const o = OUTCOMES[Number(e.key) - 1];
        if (o) {
          e.preventDefault();
          openOutcome(o);
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        saveAndNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openOutcome, saveAndNext]);

  const phone = item ? (item.whatsappNumber || item.phone || "").replace(/\D/g, "") : "";
  const waNumber = item ? formatPhoneForWhatsApp(item.whatsappNumber || item.phone) : "";
  // Server-decided, carried on each queue row; when true the number is masked.
  const contactsHidden = !!item?.contactHidden;

  const done = Math.min(idx + 1, queue.length);
  const progress = queue.length ? (done / queue.length) * 100 : 0;

  const skip = () => {
    clearCall();
    resetStep();
    setIdx((i) => i + 1);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      {/* ===== Top bar ===== */}
      <div className="sticky top-0 z-10 border-b border-border bg-white">
        <div className={`mx-auto flex w-full ${CARD_MAX} items-center gap-3 px-4 py-3`}>
          <h2 className="shrink-0 text-base font-bold text-navy">
            {isQuality ? "Quality Leads" : "Call Queue"}
          </h2>
          {queue.length > 0 && (
            <span className="shrink-0 text-sm font-semibold text-muted">
              {done} of {queue.length}
            </span>
          )}
          <div
            className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={queue.length}
            aria-valuenow={done}
            aria-label="Queue progress"
          >
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <button
            type="button"
            onClick={onExit}
            className="h-11 shrink-0 rounded-xl border border-border bg-white px-4 text-sm font-bold text-navy transition-colors hover:bg-primary/5"
          >
            Exit
          </button>
        </div>
      </div>

      <div className={`mx-auto w-full ${CARD_MAX} px-4 py-6`}>
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-border bg-white p-6 text-center">
            <p className="text-sm font-semibold text-navy">{error}</p>
            <div className="mt-4">
              <Button onClick={onExit}>Back to dashboard</Button>
            </div>
          </div>
        ) : !item ? (
          <div className="rounded-xl border border-border bg-white p-8 text-center">
            <p className="text-base font-bold text-navy">Queue complete</p>
            <p className="mt-2 text-sm text-muted">
              {isQuality
                ? "Every quality lead has been worked."
                : "Every lead due today has been worked."}
            </p>
            <div className="mt-4">
              <Button onClick={onExit}>Back to dashboard</Button>
            </div>
          </div>
        ) : (
              <div className="space-y-4">
            <ContactMaskingBanner masking={masking} />

            {/* ===== Lead card ===== */}
            <div className="rounded-xl border border-border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-[28px] font-bold leading-tight text-navy">{item.name}</h3>
                {item.priorityGroup === "overdue" && (
                  <span className="mt-1 rounded-full bg-red-50 px-2 text-sm font-semibold leading-6 text-red-700">
                    Overdue
                  </span>
                )}
              </div>

              {contactsHidden ? (
                <p className="mt-1 text-[22px] font-semibold text-amber-800">{item.phone}</p>
              ) : (
                <a
                  href={`tel:+${phone}`}
                  className="mt-1 block text-[22px] font-semibold text-primary hover:underline"
                >
                  {item.phone}
                </a>
              )}

              {item.requirementLines.length > 0 && (
                <p className="mt-2 text-sm text-muted">{item.requirementLines.join("  ·  ")}</p>
              )}

              {/* Last two notes, for context before dialling. */}
              {item.pastNotes.length > 0 && (
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                  {item.pastNotes.slice(0, 2).map((n) => (
                    <div key={n.id}>
                      <div className="text-sm font-semibold text-muted">
                        {n.label} · {n.userName} · {formatNoteTime(n.createdAt)}
                      </div>
                      <p className="mt-1 text-sm text-navy">{n.notes}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Outside office hours the API has already replaced the number,
                  so there is nothing real to dial: the buttons are disabled
                  rather than pointing at a masked string. */}
              <div className="mt-4 flex gap-3">
                {contactsHidden ? (
                  <>
                    <span
                      title="Available during office hours"
                      className="inline-flex h-14 flex-1 cursor-not-allowed items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-dashed border-amber-300 bg-amber-50 text-base font-bold text-amber-800"
                    >
                      <PhoneIcon className="h-5 w-5 shrink-0" />
                      Call
                    </span>
                    <span
                      title="Available during office hours"
                      className="inline-flex h-14 flex-1 cursor-not-allowed items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-dashed border-amber-300 bg-amber-50 text-base font-bold text-amber-800"
                    >
                      <WhatsAppIcon className="h-5 w-5 shrink-0" />
                      WhatsApp
                    </span>
                  </>
                ) : (
                  <>
                    <a
                      href={`tel:+${phone}`}
                      onClick={() => void beginCall("phone", phone)}
                      className="inline-flex h-14 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary text-base font-bold text-white transition-colors hover:bg-secondary"
                    >
                      <PhoneIcon className="h-5 w-5 shrink-0" />
                      Call
                    </a>
                    <a
                      href={`https://wa.me/${waNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void beginCall("whatsapp", phone)}
                      className="inline-flex h-14 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#25D366] text-base font-bold text-white transition-colors hover:bg-[#1DA851]"
                    >
                      <WhatsAppIcon className="h-5 w-5 shrink-0" />
                      WhatsApp
                    </a>
                  </>
                )}
              </div>

              {/* Live attempt timer. Present only once a session has opened, so
                  it never implies a call is being recorded before one was. */}
              {callRunning && (
                <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-primary">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                  Logging call · {formatCallDuration(callElapsed)}
                </p>
              )}

              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={skip}
                  className="text-sm font-semibold text-muted hover:text-primary hover:underline"
                >
                  Skip
                </button>
                <Link
                  href={`/crm/leads/${item.id}`}
                  className="text-sm font-semibold text-muted hover:text-primary hover:underline"
                >
                  Open Lead
                </Link>
              </div>
            </div>

            {/* ===== Log outcome: 2 rows x 3 ===== */}
            <div className="rounded-xl border border-border bg-white p-4">
              <h4 className="text-sm font-bold text-navy">Log outcome</h4>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {OUTCOMES.map((o, i) => {
                  const selected = outcome?.key === o.key;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => openOutcome(o)}
                      aria-pressed={selected}
                      title={`${o.label} (${i + 1})`}
                      className={`min-h-12 rounded-xl border px-2 py-3 text-center text-sm font-semibold leading-tight transition-colors ${
                        selected
                          ? "border-primary text-navy ring-2 ring-primary"
                          : `${TONE_CLS[o.tone]} hover:border-primary/40`
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>

              {/* One small step under the buttons, per outcome. */}
              {outcome && (
                <div className="mt-4 border-t border-border pt-4">
                  {outcome.when && (
                    <div>
                      <label className="block text-sm font-semibold text-navy">
                        {outcome.whenLabel}
                        {outcome.whenRequired && <span className="text-red-600"> *</span>}
                      </label>
                      <input
                        type="datetime-local"
                        value={followUp}
                        onChange={(e) => setFollowUp(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-navy focus:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      />
                    </div>
                  )}

                  {outcome.note && (
                    <div className={outcome.when ? "mt-4" : ""}>
                      <label className="block text-sm font-semibold text-navy">Note</label>
                      <textarea
                        rows={2}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Short summary of the call..."
                        className="mt-2 w-full rounded-xl border border-border bg-white px-4 py-3 text-sm text-navy focus:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      />
                    </div>
                  )}

                  {!outcome.when && !outcome.note && (
                    <p className="text-sm text-muted">
                      Follow-up set automatically for {formatNoteTime(followUp)}.
                    </p>
                  )}

                  {outcome.key === "wrong_number" && (
                    <p className="text-sm text-muted">Saving will mark this lead invalid.</p>
                  )}

                  {apiError && (
                    <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
                      {apiError}
                    </p>
                  )}

                  <div className="mt-4 flex items-center gap-3">
                    <Button onClick={saveAndNext} disabled={submitting} className="h-12 flex-1">
                      {submitting ? "Saving..." : "Save & Next"}
                    </Button>
                    <button
                      type="button"
                      onClick={resetStep}
                      className="shrink-0 text-sm font-semibold text-muted hover:text-navy"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <p className="text-center text-sm text-muted">
              Press 1–6 to pick an outcome, Enter to save.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
