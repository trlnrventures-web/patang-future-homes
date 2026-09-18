"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useCallback, useEffect } from "react";
import { Badge, Button, PhoneIcon, WhatsAppIcon } from "./ui";
import {
  LEAD_STATUS_LABELS,
  ACTIVITY_LABELS,
  LEAD_LOST_REASONS,
  LEAD_STATUS_GROUPS,
  lostReasonLabel,
  getLeadLostReason,
  setLeadLostReasonInNotes,
  bhkLabel,
} from "@/lib/crm/leads";
import { formatPhoneForWhatsApp } from "@/lib/crm/messages";
import { slaStatusMeta, formatLeadAge } from "@/lib/crm/sla";
import { matchLevelMeta, type PropertyMatch } from "@/lib/crm/matching";
import { SUB_LOCATIONS, priceValidityInfo } from "@/lib/projects";

export type LeadDetailData = {
  lead: Record<string, any>;
  activities: any[];
  followUps: any[];
  visits: any[];
  users: { id: number; name: string; role: string }[];
  latestFeedback: Record<string, any> | null;
};

type Props = {
  data: LeadDetailData;
  currentUser: { id: number; role: string; name: string };
};

export default function LeadDetail({ data, currentUser }: Props) {
  const [lead, setLead] = useState(data.lead);
  const [activities, setActivities] = useState(data.activities);
  const [followUps, setFollowUps] = useState(data.followUps);
  const [visits, setVisits] = useState(data.visits);
  const [latestFeedback, setLatestFeedback] = useState(data.latestFeedback);
  const [toast, setToast] = useState("");
  const [note, setNote] = useState("");
  const [editingReq, setEditingReq] = useState(false);
  const [tagShown, setTagShown] = useState(false);
  const [tagText, setTagText] = useState("");
  const [tagLogged, setTagLogged] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [showVisit, setShowVisit] = useState(false);
  const [showCallback, setShowCallback] = useState(false);
  const [selectedSm, setSelectedSm] = useState<number | "">("");
  const [sms, setSms] = useState<Record<number, any>>({});
  const [matches, setMatches] = useState<PropertyMatch[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const [callbackTime, setCallbackTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [showLostPicker, setShowLostPicker] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [lostNote, setLostNote] = useState("");
  const [visitDefaults, setVisitDefaults] = useState({
    date: "",
    time: "11:00",
    project: "",
    meetingPoint: "",
  });

  const smUsers = data.users.filter((u) => u.role === "sales_manager");
  const isCaller = currentUser.role === "caller";
  const isAdmin = currentUser.role === "admin" || currentUser.role === "sales_head";
  const canAssign = isCaller || isAdmin;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  }, []);

  const patchLead = useCallback(
    async (body: any) => {
      const res = await fetch(`/crm/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setLead(data.lead);
      return data.lead;
    },
    [lead.id]
  );

  const postActivity = useCallback(
    async (body: any) => {
      const res = await fetch(`/crm/api/leads/${lead.id}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      if (data.lead) setLead((l) => ({ ...l, ...data.lead }));
      return data;
    },
    [lead.id]
  );

  const reload = useCallback(async () => {
    const res = await fetch(`/crm/api/leads/${lead.id}`);
    if (res.ok) {
      const fresh = await res.json();
      setLead(fresh.lead);
      setActivities(fresh.activities);
      setFollowUps(fresh.followUps);
      setVisits(fresh.visits);
      if (fresh.latestFeedback) setLatestFeedback(fresh.latestFeedback);
    }
  }, [lead.id]);

  useEffect(() => {
    if (canAssign) {
      fetch("/crm/api/team/sms")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.sms) setSms(Object.fromEntries(d.sms.map((s: any) => [s.id, s])));
        })
        .catch(() => {});
    }
  }, [canAssign]);

  const loadMatches = useCallback(async () => {
    if (matchesLoaded) return;
    setMatchesLoaded(true);
    try {
      const res = await fetch(`/crm/api/leads/${lead.id}/matches`);
      if (res.ok) {
        const d = await res.json();
        setMatches(d.matches);
      }
    } catch {
      setMatchesLoaded(true);
    }
  }, [lead.id, matchesLoaded]);

  const handleCallOutcome = async (type: string, extra?: any) => {
    setBusy(true);
    try {
      await postActivity({ type, notes: extra?.notes || "", ...extra });
      showToast(ACTIVITY_LABELS[type] || "Updated");
      reload();
    } catch {
      showToast("Could not update");
    } finally {
      setBusy(false);
    }
  };

  const handleRecordConcern = async (concern: string) => {
    setBusy(true);
    try {
      await postActivity({ type: "concern", concern, notes: `Concern recorded: ${concern}` });
      showToast("Concern recorded. Customer stays active.");
      reload();
    } catch {
      showToast("Could not record");
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    setBusy(true);
    try {
      await patchLead({ status });
      showToast(`Status → ${LEAD_STATUS_LABELS[status]}`);
      reload();
    } catch {
      showToast("Could not update status");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmLost = async () => {
    if (!lostReason) {
      showToast("Select a reason");
      return;
    }
    setBusy(true);
    try {
      await patchLead({
        status: "lost",
        notes: setLeadLostReasonInNotes(lead.notes, lostReason),
        statusChangeNote: lostNote.trim() || `Lead lost: ${lostReasonLabel(lostReason)}`,
      });
      showToast("Lead marked lost");
      setShowLostPicker(false);
      setLostReason("");
      setLostNote("");
      reload();
    } catch {
      showToast("Could not update");
    } finally {
      setBusy(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedSm) return;
    setBusy(true);
    try {
      await postActivity({ type: "assignment", smId: selectedSm });
      showToast("Lead assigned");
      reload();
    } catch {
      showToast("Could not assign");
    } finally {
      setBusy(false);
    }
  };

  const handleAddNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await postActivity({ type: "note", notes: note.trim() });
      setNote("");
      showToast("Note added");
      reload();
    } catch {
      showToast("Could not add note");
    } finally {
      setBusy(false);
    }
  };

  const handleFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    setBusy(true);
    try {
      await postActivity({
        type: "follow_up",
        scheduledFor: formData.get("scheduledFor"),
        purpose: formData.get("purpose"),
        notes: formData.get("followNote"),
      });
      showToast("Follow-up scheduled");
      setShowFollowUp(false);
      reload();
    } catch {
      showToast("Could not schedule");
    } finally {
      setBusy(false);
    }
  };

  const handleVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    setBusy(true);
    try {
      await postActivity({
        type: "visit_booked",
        visitDate: formData.get("visitDate"),
        visitTime: formData.get("visitTime"),
        meetingPoint: formData.get("meetingPoint"),
        projectId: formData.get("visitProject"),
        smId: lead.assignedSmId || currentUser.id,
        notes: formData.get("visitNote"),
      });
      showToast("Site visit booked");
      setShowVisit(false);
      reload();
    } catch {
      showToast("Could not book visit");
    } finally {
      setBusy(false);
    }
  };

  const phone = (lead.whatsappNumber || lead.phone || "").replace(/\D/g, "");
  const waNumber = formatPhoneForWhatsApp(phone);
  const notesList = activities.filter((a) => a.type === "note");

  const SECOND_VISIT_MESSAGE =
    "Great to see your interest! Would you like to bring your family for a second look this weekend? I can arrange a convenient time.";
  const shouldSuggestSecondVisit =
    !!latestFeedback &&
    (String(latestFeedback.interest || "").toLowerCase() === "hot" ||
      String(latestFeedback.likedProperty || "").toLowerCase() === "yes" ||
      latestFeedback.likedProperty === true);

  const requiredFieldsFilled = Boolean(lead.bhk && (lead.budget || (lead.budgetMin && lead.budgetMax)) && lead.location);

  const qualificationFields = [
    { key: "Location", filled: Boolean(lead.location) },
    { key: "BHK", filled: Boolean(lead.bhk) },
    { key: "Budget", filled: Boolean(lead.budget || lead.budgetMin || lead.budgetMax) },
    { key: "Purpose", filled: Boolean(lead.purpose) },
    { key: "Timeline", filled: Boolean(lead.timeline) },
    { key: "Loan", filled: lead.loanRequired != null },
    { key: "Family", filled: Boolean(lead.familyRequirements) },
    { key: "Other Prefs", filled: Boolean(lead.otherPreferences) },
  ];
  const qualificationDone = qualificationFields.filter((f) => f.filled).length;

  return (
    <div className="space-y-7">
      {toast && (
        <div className="fixed left-1/2 top-16 z-[100] -translate-x-1/2 rounded-xl bg-navy px-4 py-2.5 text-sm font-medium text-white shadow-2xl">
          {toast}
        </div>
      )}

      {/* ===== Lead meta ===== */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge color={slaStatusMeta(lead.slaStatus || "n/a").cls}>
          {slaStatusMeta(lead.slaStatus || "n/a").label}
        </Badge>
        <Badge color="bg-primary/5 text-primary">
          Received {formatLeadAge(lead.createdAt)}
        </Badge>
        {lead.attemptCount > 0 && (
          <Badge color="bg-slate-100 text-slate-700">
            {lead.attemptCount} attempt{lead.attemptCount > 1 ? "s" : ""}
          </Badge>
        )}
        {lead.assignedSmName && (
          <Badge color="bg-violet-100 text-violet-800">SM: {lead.assignedSmName}</Badge>
        )}
      </div>

      {/* ===== Quick actions ===== */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <a
          href={`tel:+${phone}`}
          className="flex flex-col items-center gap-1.5 rounded-xl bg-primary px-3 py-3 text-white"
        >
          <PhoneIcon />
          <span className="text-xs font-bold">CALL</span>
        </a>
        <a
          href={`https://wa.me/${waNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-3 text-white"
        >
          <WhatsAppIcon />
          <span className="text-xs font-bold">WHATSAPP</span>
        </a>
        <a
          href="#message-center"
          className="flex flex-col items-center gap-1.5 rounded-xl bg-secondary px-3 py-3 text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10ZM8 10h8" />
          </svg>
          <span className="text-xs font-bold">MESSAGE</span>
        </a>
        <button
          onClick={() => setShowFollowUp((s) => !s)}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-amber-700"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <span className="text-xs font-bold">FOLLOW-UP</span>
        </button>
        <button
          onClick={openVisit}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-3 text-emerald-700"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span className="text-xs font-bold">VISIT</span>
        </button>
        <button
          onClick={() => {
            setShowMatches(true);
            loadMatches();
          }}
          className="flex flex-col items-center gap-1.5 rounded-xl bg-accent px-3 py-3 text-primary"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <span className="text-xs font-bold">FIND PROPERTY</span>
        </button>
        {!isCaller && (
          <a
            href={`/crm/leads/${lead.id}/negotiation`}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-fuchsia-300 bg-fuchsia-50 px-3 py-3 text-fuchsia-700"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M9 3H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1ZM20 3h-5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1ZM9 15H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1ZM20 15h-5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1Z" />
            </svg>
            <span className="text-xs font-bold">NEGOTIATION</span>
          </a>
        )}
      </div>

      {/* ===== 2nd visit suggestion (post-visit feedback) ===== */}
      {shouldSuggestSecondVisit && (
        <div className="rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-navy">
              Suggest a 2nd visit with family?
            </h3>
            <Badge color="bg-amber-100 text-amber-800">Post-visit feedback</Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            Customer showed strong interest after the site visit (
            {latestFeedback?.interest ? `interest: ${String(latestFeedback.interest).toUpperCase()}` : ""}
            {latestFeedback?.likedProperty ? (latestFeedback.interest ? " · " : "") + `liked: ${String(latestFeedback.likedProperty).toUpperCase()}` : ""}
            ). Lock in a family follow-up visit before interest fades.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`https://wa.me/${waNumber}?text=${encodeURIComponent(SECOND_VISIT_MESSAGE)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleShareSecondVisit}
              className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
            >
              <WhatsAppIcon />
              Send on WhatsApp
            </a>
            <button
              onClick={openVisitWithFamily}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-700 transition-opacity hover:bg-emerald-100 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Book 2nd Visit
            </button>
          </div>
          <p className="mt-2 text-[10px] text-soft">
            WhatsApp message is pre-filled, just send it. Or book a weekend visit right away.
          </p>
        </div>
      )}

      {/* ===== Row 2: Call Outcome + Original Enquiry ===== */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={`rounded-2xl border border-border bg-white p-4 ${lead.originalProject ? "" : "sm:col-span-2"}`}>
          <h3 className="mb-3 text-sm font-bold text-primary">Call Outcome</h3>
          <div className="flex flex-wrap gap-2">
            {[
              { t: "call_connected", label: "Connected", color: "bg-green-100 text-green-800" },
              { t: "call_no_answer", label: "No Answer", color: "bg-amber-100 text-amber-800" },
              { t: "call_busy", label: "Busy", color: "bg-orange-100 text-orange-800" },
              { t: "call_wrong_number", label: "Wrong Number", color: "bg-red-100 text-red-700" },
              { t: "call_back", label: "Call Back", color: "bg-blue-100 text-blue-800" },
              { t: "call_not_interested", label: "Not Interested", color: "bg-slate-200 text-slate-700" },
              { t: "call_other", label: "Other", color: "bg-gray-100 text-gray-700" },
            ].map((b) => (
              <button
                key={b.t}
                disabled={busy}
                onClick={() => {
                  if (b.t === "call_back") {
                    setShowCallback((s) => !s);
                  } else {
                    handleCallOutcome(b.t);
                  }
                }}
                className={`rounded-full px-4 py-2 text-xs font-bold transition-opacity disabled:opacity-50 ${b.color}`}
              >
                {b.label}
              </button>
            ))}
          </div>
          {showCallback && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="datetime-local"
                value={callbackTime}
                onChange={(e) => setCallbackTime(e.target.value)}
                className="flex-1 rounded-xl border border-blue-300 bg-white px-3 py-2.5 text-sm text-navy outline-none"
              />
              <Button
                disabled={busy || !callbackTime}
                onClick={() => {
                  handleCallOutcome("call_back", { callbackTime: new Date(callbackTime).toISOString() });
                  setShowCallback(false);
                  setCallbackTime("");
                }}
              >
                Confirm Call Back
              </Button>
            </div>
          )}
          <p className="mt-2 text-[10px] text-soft">
            The CALL button dials the phone. Log the outcome here after the call.
          </p>
        </div>

        {/* Concern / Rejected project */}
        {lead.originalProject && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-primary">
                Original Enquiry: {lead.originalProject}
              </h3>
              {lead.concern && (
                <Badge color="bg-amber-100 text-amber-800">Concern: {lead.concern}</Badge>
              )}
            </div>
            <p className="mb-2 text-xs text-muted">
              The project can be rejected, not the customer. Record the agenda and show alternative options.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { v: "budget", l: "Budget too high" },
                { v: "location", l: "Location not preferred" },
                { v: "bhk", l: "BHK size" },
                { v: "possession", l: "Possession time" },
                { v: "comparing", l: "Comparing with others" },
              ].map((c) => (
                <button
                  key={c.v}
                  disabled={busy}
                  onClick={() => handleRecordConcern(c.v)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    lead.concern === c.v
                      ? "border-amber-500 bg-amber-100 text-amber-800"
                      : "border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
                  }`}
                >
                  {c.l}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== Status change ===== */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <h3 className="mb-3 text-sm font-bold text-primary">Lead Status</h3>
        {LEAD_STATUS_GROUPS.map((g) => (
          <div key={g.label} className="mb-3 last:mb-0">
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-soft">
              {g.label}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {g.values.map((s) => {
                const label = LEAD_STATUS_LABELS[s] || s;
                return (
                  <button
                    key={s}
                    onClick={() => {
                      if (s === "lost") {
                        setLostReason(getLeadLostReason(lead.notes) || "");
                        setLostNote("");
                        setShowLostPicker(true);
                      } else {
                        handleStatusChange(s);
                      }
                    }}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                      lead.status === s
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-white text-muted hover:bg-primary/5"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ===== Lead lost / reason ===== */}
      {lead.status === "lost" && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-primary">Lead Lost</h3>
              <Badge color="bg-red-100 text-red-700">
                {getLeadLostReason(lead.notes) || "No reason"}
              </Badge>
            </div>
            <button
              onClick={() => {
                setLostReason(getLeadLostReason(lead.notes) || "");
                setLostNote("");
                setShowLostPicker(true);
              }}
              className="text-xs font-semibold text-red-700 hover:underline"
            >
              Change reason
            </button>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Original enquiry is preserved, so the customer can be reactivated. Lost reason is used in
            Reports for project-level loss analysis.
          </p>
        </div>
      )}

      {/* ===== Requirement card ===== */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-primary">Requirement</h3>
          {(isCaller || isAdmin) && (
            <button
              onClick={() => setEditingReq((s) => !s)}
              className="text-xs font-semibold text-accent-ink hover:underline"
            >
              {editingReq ? "Cancel ✕" : "✎ Edit"}
            </button>
          )}
        </div>

        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-semibold text-navy">Qualification Progress</span>
            <span className="font-bold text-primary">
              {qualificationDone}/8 captured
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${(qualificationDone / 8) * 100}%` }}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {qualificationFields.map((f) => (
              <span
                key={f.key}
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  f.filled
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-gray-100 text-soft"
                }`}
              >
                {f.filled ? "✓ " : "○ "}{f.key}
              </span>
            ))}
          </div>
        </div>

        {!requiredFieldsFilled && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Requirement is not complete yet. Call and qualify the lead.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2.5 text-sm sm:grid-cols-3">
          <ReqItem label="Location" value={lead.location || ""} />
          <ReqItem label="Sub-location" value={lead.sublocation || ""} />
          <ReqItem label="Budget" value={budgetLabel(lead)} />
          <ReqItem label="BHK" value={bhkLabel(lead.bhk)} />
          <ReqItem label="Purpose" value={purposeLabel(lead.purpose)} />
          <ReqItem label="Timeline" value={timelineLabel(lead.timeline)} />
          <ReqItem label="Loan Required" value={loanLabel(lead.loanRequired)} />
        </div>

        {lead.preferredProject && (
          <div className="mt-3 text-sm">
            <span className="text-soft">Preferred project: </span>
            <span className="font-semibold text-navy">{lead.preferredProject}</span>
          </div>
        )}
        {lead.familyRequirements && (
          <div className="mt-1 text-sm">
            <span className="text-soft">Family: </span>
            <span className="text-navy">{lead.familyRequirements}</span>
          </div>
        )}
        {lead.notes && (
          <div className="mt-1 text-sm">
            <span className="text-soft">Notes: </span>
            <span className="text-navy">{lead.notes}</span>
          </div>
        )}

        {editingReq && (
          <RequirementEditor
            lead={lead}
            onSave={handleSaveRequirement}
            onCancel={() => setEditingReq(false)}
          />
        )}
      </div>

      {/* ===== Lead Tag + SM handoff/assign ===== */}
      <div className="grid gap-4 sm:grid-cols-2">
      <div className={`rounded-2xl border border-primary/15 bg-white p-4 ${(canAssign && !lead.assignedSmId) || lead.assignedSmName ? "" : "sm:col-span-2"}`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-primary">Lead Tag</h3>
          {!tagShown && (
            <button
              onClick={handleGenerateTag}
              disabled={busy}
              className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Generate Lead Tag
            </button>
          )}
        </div>
        {tagShown ? (
          <div>
            <pre className="whitespace-pre-wrap rounded-xl bg-navy p-3 text-[11px] leading-relaxed text-white">{tagText}</pre>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button onClick={handleCopyTag} disabled={busy}>Copy Tag Message</Button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(tagText)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleShareTag}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
              >
                Share on WhatsApp
              </a>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted">
            Generate a summary of the client and visit details to share easily on WhatsApp.
          </p>
        )}
      </div>

      {/* ===== Assign to SM ===== */}
      {canAssign && !lead.assignedSmId && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <h3 className="mb-2 text-sm font-bold text-primary">
            Assign to Sales Manager
          </h3>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={selectedSm}
              onChange={(e) => setSelectedSm(Number(e.target.value))}
              className="flex-1 rounded-xl border border-violet-300 bg-white px-4 py-2.5 text-sm text-navy outline-none"
            >
              <option value="">Select SM...</option>
              {smUsers.map((sm) => (
                <option key={sm.id} value={sm.id}>
                  {sm.name}
                </option>
              ))}
            </select>
            <Button onClick={handleAssign} disabled={busy || !selectedSm}>
              Assign
            </Button>
          </div>
          {selectedSm && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(() => {
                const w = sms[selectedSm];
                if (!w) return <p className="col-span-full text-xs text-muted">Loading workload...</p>;
                return [
                  ["Active Leads", w.activeLeads],
                  ["Today's Follow-ups", w.todaysFollowUps],
                  ["Visits Upcoming", w.upcomingVisits],
                  ["Overdue", w.overdueFollowUps],
                ].map(([label, val]) => (
                  <div key={label as string} className="rounded-xl bg-white px-3 py-2 text-center">
                    <div className="text-lg font-bold text-navy">{val}</div>
                    <div className="text-[10px] text-soft">{label}</div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}
      {lead.assignedSmName && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-primary">SM Handoff</h3>
            <Badge color="bg-violet-100 text-violet-800">Assigned to {lead.assignedSmName}</Badge>
          </div>
          <div className="rounded-xl bg-white p-3 text-sm">
            <div className="mb-1 font-bold text-navy">CUSTOMER REQUIREMENT: {lead.name}</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <HandoffItem label="Location" value={lead.location || ""} />
              <HandoffItem label="Sub-location" value={lead.sublocation || ""} />
              <HandoffItem label="Budget" value={budgetLabel(lead)} />
              <HandoffItem label="BHK" value={bhkLabel(lead.bhk)} />
              <HandoffItem label="Purpose" value={purposeLabel(lead.purpose)} />
              <HandoffItem label="Timeline" value={timelineLabel(lead.timeline)} />
              <HandoffItem label="Loan" value={loanLabel(lead.loanRequired)} />
              <HandoffItem label="Original Enquiry" value={lead.originalProject || ""} />
              <HandoffItem label="Customer Concern" value={lead.concern || ""} />
            </dl>
            {lead.familyRequirements && (
              <p className="mt-2 text-xs text-muted">Family: {lead.familyRequirements}</p>
            )}
            {lead.otherPreferences && (
              <p className="mt-1 text-xs text-muted">Prefs: {lead.otherPreferences}</p>
            )}
            {lead.assignedAt && (
              <p className="mt-2 text-[10px] text-soft">
                Assigned {formatDateTime(String(lead.assignedAt))}
              </p>
            )}
          </div>
        </div>
      )}
      </div>

      {/* ===== Property matches ===== */}
      {(showMatches || matches.length > 0) && (
        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-primary">Matching Properties</h3>
            {matches.length === 0 && !matchesLoaded && (
              <button onClick={loadMatches} className="text-xs font-semibold text-accent-ink">
                Load matches
              </button>
            )}
          </div>
          {matches.length === 0 ? (
            <p className="text-xs text-muted">
              Complete the requirement (budget, location, BHK) and matching properties will appear.
            </p>
          ) : (
            <div className="space-y-2.5">
              {matches.map((m) => (
                <div key={m.projectSlug} className={`rounded-xl border p-3 ${m.source === "market" ? "border-blue-100 bg-blue-50/40" : "border-border bg-white"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-navy">{m.title}</span>
                        {m.source === "market" && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Partner network</span>
                        )}
                        {m.developer && (
                          <span className="text-[10px] text-soft">· {m.developer}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted">
                        {m.location} · {m.bhkOptions.map(bhkLabel).join(", ") || ""}
                      </div>
                    </div>
                    <Badge color={matchLevelMeta(m.level).cls}>
                      {matchLevelMeta(m.level).label}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-soft">
                    {m.priceRange} · Possession {m.possessionDate}
                  </div>
                  {m.priceValidUntil && (() => {
                    const pv = priceValidityInfo({ priceValidUntil: m.priceValidUntil });
                    return pv ? (
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        ⏰ Price valid till {pv.validUntil} · {pv.daysLeft} day{pv.daysLeft === 1 ? "" : "s"} left
                      </span>
                    ) : null;
                  })()}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.reasons.map((r, i) => (
                      <span
                        key={i}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          r.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                        }`}
                      >
                        {r.ok ? "✓" : "✗"} {r.label}
                      </span>
                    ))}
                  </div>
                  {m.source === "primary" ? (
                    <a
                      href={`/projects/${m.projectSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
                    >
                      View project →
                    </a>
                  ) : (
                    <span className="mt-2 inline-block text-[11px] font-semibold text-blue-600">
                      Available via partner network
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== Follow-up form ===== */}
      {showFollowUp && (
        <form onSubmit={handleFollowUp} className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <h3 className="text-sm font-bold text-primary">Schedule Follow-up</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Date & Time</label>
              <input
                type="datetime-local"
                name="scheduledFor"
                required
                className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-sm text-navy outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Purpose</label>
              <input
                type="text"
                name="purpose"
                defaultValue="Follow-up - Property options"
                className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-sm text-navy outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Note</label>
            <textarea name="followNote" rows={2} className="w-full resize-none rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-sm text-navy outline-none" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>Schedule</Button>
            <Button variant="ghost" onClick={() => setShowFollowUp(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {/* ===== Visit form ===== */}
      {showVisit && (
        <form onSubmit={handleVisit} className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
          <h3 className="text-sm font-bold text-primary">Book Site Visit</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Date</label>
              <input type="date" name="visitDate" required defaultValue={visitDefaults.date} className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2.5 text-sm text-navy outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Time</label>
              <input type="time" name="visitTime" required defaultValue={visitDefaults.time || "11:00"} className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2.5 text-sm text-navy outline-none" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Project</label>
            <input type="text" name="visitProject" defaultValue={visitDefaults.project || lead.preferredProject || lead.originalProject || ""} className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2.5 text-sm text-navy outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Meeting Point</label>
            <input type="text" name="meetingPoint" defaultValue={visitDefaults.meetingPoint} placeholder="e.g. Project gate, Vasai West station..." className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2.5 text-sm text-navy outline-none" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>Book Visit</Button>
            <Button variant="ghost" onClick={() => setShowVisit(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {/* ===== Row: Notes + Call History ===== */}
      <div className="grid gap-4 sm:grid-cols-2">
      <div className={`rounded-2xl border border-border bg-white p-4 ${activities.some((a) => String(a.type).startsWith("call")) ? "" : "sm:col-span-2"}`}>
        <h3 className="mb-1 text-sm font-bold text-primary">Notes</h3>
        <p className="mb-3 text-[10px] text-soft">
          Call updates, customer preferences, and reminders all in one place.
        </p>
        {notesList.length === 0 ? (
          <p className="rounded-xl bg-background px-3 py-2 text-xs text-muted">No notes yet.</p>
        ) : (
          <div className="space-y-2">
            {notesList.map((a) => (
              <div key={a.id} className="rounded-xl bg-background px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-navy">{a.userName || ""}</span>
                  <span className="text-[10px] text-soft">{formatDateTime(a.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-sm text-navy">{a.notes}</p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddNote();
            }}
            placeholder="Add a note..."
            className="flex-1 rounded-xl border border-border bg-background/50 px-4 py-2.5 text-sm text-navy outline-none focus:border-primary"
          />
          <Button onClick={handleAddNote} disabled={busy || !note.trim()}>Add</Button>
        </div>
      </div>

      {/* ===== Call history ===== */}
      {activities.some((a) => String(a.type).startsWith("call")) && (
        <div className="rounded-2xl border border-border bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-primary">Call History</h3>
          <div className="space-y-2">
            {activities
              .filter((a) => String(a.type).startsWith("call"))
              .slice(0, 10)
              .map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl bg-background px-3 py-2">
                  <div className="min-w-0 text-sm">
                    <span className="font-semibold text-navy">{ACTIVITY_LABELS[a.type] || a.type}</span>
                    {a.notes && <span className="ml-2 text-xs text-muted">{a.notes}</span>}
                  </div>
                  <span className="shrink-0 text-[10px] text-soft">{formatDateTime(a.createdAt)}</span>
                </div>
              ))}
          </div>
        </div>
      )}
      </div>

      {/* ===== Row: Site Visits + Follow-ups ===== */}
      {(visits.length > 0 || followUps.length > 0) && (
      <div className="grid gap-4 sm:grid-cols-2">
      {visits.length > 0 && (
        <div className={`rounded-2xl border border-border bg-white p-4 ${visits.length > 0 && followUps.length > 0 ? "" : "sm:col-span-2"}`}>
          <h3 className="mb-3 text-sm font-bold text-primary">Site Visits</h3>
          <div className="space-y-2">
            {visits.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 rounded-xl bg-background p-3">
                <div className="text-sm">
                  <div className="font-semibold text-navy">
                    {v.projectId || ""} · {v.date || "TBD"} {v.time}
                  </div>
                  <div className="text-xs text-muted">SM: {v.smName || ""}</div>
                </div>
                <Badge
                  color={
                    v.status === "no_show"
                      ? "bg-red-100 text-red-700"
                      : v.status === "visit_done"
                        ? "bg-green-100 text-green-800"
                        : "bg-blue-100 text-blue-800"
                  }
                >
                  {String(v.status).toUpperCase()}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Follow-ups */}
      {followUps.length > 0 && (
        <div className={`rounded-2xl border border-border bg-white p-4 ${visits.length > 0 && followUps.length > 0 ? "" : "sm:col-span-2"}`}>
          <h3 className="mb-3 text-sm font-bold text-primary">Follow-ups</h3>
          <div className="space-y-2">
            {followUps.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 rounded-xl bg-background p-3">
                <div className="text-sm">
                  <div className="font-semibold text-navy">{f.purpose || "Follow-up"}</div>
                  <div className="text-xs text-muted">{formatDateTime(f.scheduledFor)}</div>
                  {f.notes && <div className="mt-1 text-xs text-soft">{f.notes}</div>}
                </div>
                <Badge
                  color={
                    f.status === "completed"
                      ? "bg-green-100 text-green-800"
                      : isPast(f.scheduledFor)
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-800"
                  }
                >
                  {f.status === "completed" ? "Done" : isPast(f.scheduledFor) ? "Overdue" : "Pending"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
      )}

      {/* ===== Activity timeline ===== */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <h3 className="mb-3 text-sm font-bold text-primary">Activity</h3>
        {activities.length === 0 ? (
          <p className="text-center text-xs text-muted">No activity yet.</p>
        ) : (
          <div className="space-y-3">
            {activities.slice(0, 12).map((a) => (
              <div key={a.id} className="flex gap-3">
                <div className="mt-1 flex h-2 w-2 shrink-0 rounded-full bg-primary/40" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-navy">
                      {ACTIVITY_LABELS[a.type] || a.type}
                    </span>
                    <span className="text-[10px] text-soft">
                      {a.userName} · {formatDateTime(a.createdAt)}
                    </span>
                  </div>
                  {a.notes && <div className="mt-0.5 text-xs text-muted">{a.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    {/* ===== Lost reason picker ===== */}
      {showLostPicker && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-5">
            <h3 className="text-sm font-bold text-primary">Mark Lead as Lost</h3>
            <p className="mt-0.5 text-xs text-muted">Select a reason (required).</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {LEAD_LOST_REASONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setLostReason(r.value)}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                    lostReason === r.value
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-border bg-white text-muted hover:bg-red-50"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <textarea
              value={lostNote}
              onChange={(e) => setLostNote(e.target.value)}
              placeholder="Optional note (what happened and why)..."
              rows={2}
              className="mt-3 w-full resize-none rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-navy outline-none focus:border-red-400"
            />
            <div className="mt-4 flex gap-2">
              <Button onClick={handleConfirmLost} disabled={busy}>
                Confirm Lost
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowLostPicker(false);
                  setLostReason("");
                  setLostNote("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ===== Handlers (hoisted as closures) =====
  async function handleSaveRequirement(quals: Record<string, any>) {
    setBusy(true);
    try {
      const changes: string[] = [];
      const patch: Record<string, any> = {};

      const textFields: [string, string][] = [
        ["location", "Location"],
        ["sublocation", "Sub-location"],
        ["bhk", "BHK"],
        ["purpose", "Purpose"],
        ["timeline", "Timeline"],
        ["preferredProject", "Preferred Project"],
        ["familyRequirements", "Family"],
        ["otherPreferences", "Other Prefs"],
        ["notes", "Notes"],
      ];
      for (const [key, label] of textFields) {
        if ((lead[key] ?? "") !== (quals[key] ?? "")) {
          patch[key] = quals[key];
          changes.push(`${label}: ${displayReqVal(key, lead[key])} → ${displayReqVal(key, quals[key])}`);
        }
      }

      const oldBudget = budgetLabel(lead);
      const nextBudget = budgetRangeLabel(quals.budgetMin, quals.budgetMax);
      if (oldBudget !== nextBudget) {
        patch.budgetMin = quals.budgetMin || null;
        patch.budgetMax = quals.budgetMax || null;
        patch.budget = null;
        changes.push(`Budget: ${oldBudget} → ${nextBudget}`);
      }

      const oldLoan = loanLabel(lead.loanRequired);
      const nextLoan =
        quals.loanRequired === true ? "Yes" : quals.loanRequired === false ? "No" : "";
      if (oldLoan !== nextLoan) {
        patch.loanRequired =
          quals.loanRequired === true ? true : quals.loanRequired === false ? false : null;
        changes.push(`Loan Required: ${oldLoan} → ${nextLoan}`);
      }

      if (Object.keys(patch).length === 0) {
        showToast("No changes");
        setEditingReq(false);
        return;
      }

      await patchLead(patch);
      await postActivity({ type: "requirement_changed", notes: changes.join("; ") });
      showToast("Requirement updated");
      setEditingReq(false);
      reload();
    } catch {
      showToast("Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateTag() {
    setBusy(true);
    try {
      setTagText(buildLeadTag(lead, visits, currentUser.name));
      setTagShown(true);
      if (!tagLogged) {
        setTagLogged(true);
        await postActivity({ type: "tag_generated", notes: "Lead tag generated" });
      }
      reload();
    } catch {
      showToast("Could not generate tag");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyTag() {
    try {
      await navigator.clipboard.writeText(tagText);
      showToast("Tag copied");
      postActivity({ type: "tag_copied", notes: "Lead tag copied" }).catch(() => {});
    } catch {
      showToast("Could not copy. Please select manually.");
    }
  }

  function handleShareTag() {
    postActivity({ type: "tag_copied", notes: "Lead tag shared on WhatsApp" }).catch(() => {});
  }

  function openVisit() {
    if (showVisit) {
      setShowVisit(false);
      return;
    }
    setVisitDefaults({
      date: "",
      time: "11:00",
      project: lead.preferredProject || lead.originalProject || "",
      meetingPoint: "",
    });
    setShowVisit(true);
  }

  function openVisitWithFamily() {
    const done = visits
      .filter((v) => v.status === "visit_done")
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const last = done[0];
    setVisitDefaults({
      date: nextSaturdayIST(),
      time: "11:00",
      project: last?.projectId || lead.preferredProject || lead.originalProject || "",
      meetingPoint: last?.meetingPoint || "Project site, Vasai",
    });
    setShowVisit(true);
    postActivity({
      type: "visit_proposed",
      notes: "2nd family visit suggested (post-visit feedback HOT / liked YES); booking form prefilled",
    }).catch(() => {});
  }

  function nextSaturdayIST(): string {
    const now = new Date();
    const IST_OFFSET = 5.5 * 3600 * 1000;
    const ist = new Date(now.getTime() + IST_OFFSET);
    const day = ist.getUTCDay();
    const daysUntilSat = (6 - day + 7) % 7 || 7;
    ist.setUTCDate(ist.getUTCDate() + daysUntilSat);
    return ist.toISOString().slice(0, 10);
  }

  function handleShareSecondVisit() {
    postActivity({
      type: "message_whatsapp_opened",
      notes: "2nd visit suggestion message opened on WhatsApp",
    }).catch(() => {});
  }
}

function RequirementEditor({
  lead,
  onSave,
  onCancel,
}: {
  lead: Record<string, any>;
  onSave: (quals: Record<string, any>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    location: lead.location || "vasai_west",
    sublocation: lead.sublocation || "",
    bhk: String(lead.bhk || "2").replace(/\s*BHK\s*$/i, ""),
    budgetMin: String(lead.budgetMin ?? ""),
    budgetMax: String(lead.budgetMax ?? ""),
    purpose: lead.purpose || "self_use",
    timeline: lead.timeline || "1_3_months",
    loanRequired: lead.loanRequired === true ? "yes" : lead.loanRequired === false ? "no" : "",
    preferredProject: lead.preferredProject || "",
    familyRequirements: lead.familyRequirements || "",
    otherPreferences: lead.otherPreferences || "",
    notes: lead.notes || "",
  });

  const input =
    "w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-navy outline-none focus:border-primary";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...form,
      budgetMin: form.budgetMin ? Number(form.budgetMin) : null,
      budgetMax: form.budgetMax ? Number(form.budgetMax) : null,
      loanRequired: form.loanRequired === "yes" ? true : form.loanRequired === "no" ? false : null,
    });
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 border-t border-border pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Location</label>
          <select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className={input}>
            {Object.entries(LOCATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Sub-location</label>
          <select value={form.sublocation} onChange={(e) => setForm({ ...form, sublocation: e.target.value })} className={input}>
            <option value="">None</option>
            {SUB_LOCATIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">BHK</label>
          <select value={form.bhk} onChange={(e) => setForm({ ...form, bhk: e.target.value })} className={input}>
            <option value="1">1 BHK</option>
            <option value="2">2 BHK</option>
            <option value="3">3 BHK</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Budget Min (L)</label>
          <input type="number" min={0} value={form.budgetMin} onChange={(e) => setForm({ ...form, budgetMin: e.target.value })} className={input} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Budget Max (L)</label>
          <input type="number" min={0} value={form.budgetMax} onChange={(e) => setForm({ ...form, budgetMax: e.target.value })} className={input} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Purpose</label>
          <select value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className={input}>
            <option value="self_use">Self-use</option>
            <option value="investment">Investment</option>
            <option value="both">Both</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Timeline</label>
          <select value={form.timeline} onChange={(e) => setForm({ ...form, timeline: e.target.value })} className={input}>
            <option value="immediate">Immediate</option>
            <option value="1_3_months">1–3 months</option>
            <option value="3_6_months">3–6 months</option>
            <option value="6_plus_months">6+ months</option>
            <option value="exploring">Exploring</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Loan Required</label>
          <select value={form.loanRequired} onChange={(e) => setForm({ ...form, loanRequired: e.target.value })} className={input}>
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Preferred Project</label>
        <input value={form.preferredProject} onChange={(e) => setForm({ ...form, preferredProject: e.target.value })} className={input} placeholder="e.g. Pearl Gardens" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Family Requirements</label>
        <input value={form.familyRequirements} onChange={(e) => setForm({ ...form, familyRequirements: e.target.value })} className={input} placeholder="e.g. 3 members, parents included" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Other Preferences</label>
        <input value={form.otherPreferences} onChange={(e) => setForm({ ...form, otherPreferences: e.target.value })} className={input} placeholder="Floor, facing, amenities..." />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Notes</label>
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={`${input} resize-none`} />
      </div>
      <div className="flex gap-2">
        <Button type="submit">Save</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function ReqItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-soft">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-navy">{value}</div>
    </div>
  );
}

function HandoffItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-soft">{label}</dt>
      <dd className="font-semibold text-navy">{value}</dd>
    </div>
  );
}

const LOCATION_LABELS: Record<string, string> = {
  vasai_west: "Vasai West",
  vasai_east: "Vasai East",
  naigaon: "Naigaon",
  nalasopara: "Nalasopara",
  virar: "Virar",
  other: "Other",
};

function locationLabel(v: any): string {
  if (v === null || v === undefined || v === "") return "";
  return LOCATION_LABELS[v] || String(v);
}

function displayReqVal(key: string, v: any): string {
  if (key === "bhk") return bhkLabel(v);
  if (key === "location") return locationLabel(v);
  if (key === "purpose") return purposeLabel(v);
  if (key === "timeline") return timelineLabel(v);
  if (v === null || v === undefined || v === "") return "";
  return String(v);
}

function budgetRangeLabel(min: any, max: any): string {
  if (min && max && min !== max) return `₹${min}–${max}L`;
  if (min) return `₹${min}L`;
  if (max) return `₹${max}L`;
  return "";
}

function buildLeadTag(
  lead: Record<string, any>,
  visits: any[],
  currentUserName: string
): string {
  const phone = (lead.whatsappNumber || lead.phone || "").replace(/\D/g, "");
  const last5 = phone ? phone.slice(-5) : "";
  const upcoming = visits
    .filter((v) => v.status !== "cancelled" && v.status !== "no_show" && v.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const visit = upcoming.length > 0 ? String(upcoming[0].date) : "Not Booked";
  return [
    "PATANG FUTURE HOMES · LEAD TAG",
    `Client: ${lead.name || ""}`,
    `Caller: ${lead.assignedCallerName || currentUserName || ""}`,
    `SM: ${lead.assignedSmName || ""}`,
    `Number: ${last5}`,
    `Visit Date: ${visit}`,
    "Firm: Patang Future Homes",
  ].join("\n");
}

function budgetLabel(lead: Record<string, any>): string {
  if (lead.budget) return String(lead.budget);
  const min = lead.budgetMin;
  const max = lead.budgetMax;
  if (min && max && min !== max) return `₹${min}–${max}L`;
  if (min) return `₹${min}L`;
  if (max) return `₹${max}L`;
  return "";
}

function purposeLabel(p: string): string {
  const map: Record<string, string> = {
    self_use: "Self-use",
    investment: "Investment",
    both: "Both",
  };
  return map[p] || "";
}

function timelineLabel(t: string): string {
  const map: Record<string, string> = {
    immediate: "Immediate",
    "1_3_months": "1–3 months",
    "3_6_months": "3–6 months",
    "6_plus_months": "6+ months",
    exploring: "Exploring",
  };
  return map[t] || "";
}

function loanLabel(v: boolean | number | null): string {
  if (v === true || v === 1) return "Yes";
  if (v === false || v === 0) return "No";
  return "";
}

function formatDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isPast(iso: string): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}