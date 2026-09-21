"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, PhoneIcon, WhatsAppIcon } from "./ui";
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  ACTIVITY_LABELS,
  LEAD_LOST_REASONS,
  lostReasonLabel,
  getLeadLostReason,
  setLeadLostReasonInNotes,
  bhkLabel,
  isInCallerScope,
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
  duplicates: { id: number; name: string; phone: string; reason: string }[];
};

const FUNNEL_STAGES: { key: string; label: string; status: string; matches: string[] }[] = [
  { key: "new", label: "New", status: "new", matches: ["new", "calling", "connected", "no_response"] },
  { key: "qualified", label: "Qualified", status: "qualified", matches: ["qualified"] },
  { key: "follow_up", label: "Follow-up", status: "follow_up", matches: ["assigned", "follow_up", "nurture"] },
  { key: "visit_booked", label: "Visit Booked", status: "visit_booked", matches: ["visit_proposed", "visit_booked"] },
  { key: "visit_confirmed", label: "Visit Confirmed", status: "visit_confirmed", matches: ["visit_confirmed"] },
  { key: "visit_done", label: "Visit Done", status: "visit_done", matches: ["visit_done"] },
  { key: "negotiation", label: "Negotiation", status: "negotiation", matches: ["negotiation"] },
  { key: "booked", label: "Booked", status: "booked", matches: ["booked"] },
];

const EXIT_STATUSES: { value: string; label: string }[] = [
  { value: "lost", label: "Mark as Lost" },
  { value: "invalid", label: "Mark as Invalid" },
  { value: "dnc", label: "Mark as DNC" },
];

const OVERFLOW_STATUSES = [
  "calling",
  "connected",
  "no_response",
  "assigned",
  "visit_proposed",
  "visit_confirmed",
  "visit_done",
  "nurture",
];

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
  const [selectedCaller, setSelectedCaller] = useState<number | "">("");
  const [sms, setSms] = useState<Record<number, any>>({});
  const [callers, setCallers] = useState<Record<number, any>>({});
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [matches, setMatches] = useState<PropertyMatch[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const [callbackTime, setCallbackTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [showLostPicker, setShowLostPicker] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [lostNote, setLostNote] = useState("");
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [visitDefaults, setVisitDefaults] = useState({
    date: "",
    time: "11:00",
    project: "",
    meetingPoint: "",
  });

  const smUsers = data.users.filter((u) => u.role === "sales_manager");
  const callerUsers = data.users.filter((u) => u.role === "caller");
  const isCaller = currentUser.role === "caller";
  const isAdmin = currentUser.role === "admin" || currentUser.role === "sales_head";
  const canAssign = isCaller || isAdmin;
  const canAssignCaller = isAdmin;
  // Callers keep visibility of a lead after it is handed off to an SM, but the
  // sales team owns it from then on — so the view becomes read-only for them.
  const readOnly =
    isCaller &&
    !isInCallerScope({
      status: String(lead.status),
      assignedSmId: (lead.assignedSmId as number | null) ?? null,
    });
  const router = useRouter();

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
      fetch("/crm/api/team/assignees")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) {
            setSms(Object.fromEntries(d.sms.map((s: any) => [s.id, s])));
            setCallers(Object.fromEntries(d.callers.map((c: any) => [c.id, c])));
          }
        })
        .catch(() => {});
    }
  }, [canAssign]);

  const refreshMatches = useCallback(async () => {
    try {
      const res = await fetch(`/crm/api/leads/${lead.id}/matches`);
      if (res.ok) {
        const d = await res.json();
        setMatches(d.matches);
      }
    } catch {
      // keep the existing matches if the refresh fails
    } finally {
      setMatchesLoaded(true);
    }
  }, [lead.id]);

  const loadMatches = useCallback(async () => {
    if (matchesLoaded) return;
    setMatchesLoaded(true);
    await refreshMatches();
  }, [matchesLoaded, refreshMatches]);

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

  const handleAssignCaller = async (callerId: number | "auto") => {
    setBusy(true);
    try {
      await patchLead(callerId === "auto" ? { assignCaller: "auto" } : { assignedCallerId: callerId });
      setSelectedCaller("");
      showToast("Caller assigned");
      reload();
    } catch {
      showToast("Could not assign caller");
    } finally {
      setBusy(false);
    }
  };

  const handleAssignSm = async (smId: number | "auto") => {
    setBusy(true);
    try {
      await patchLead(smId === "auto" ? { assignSm: "auto" } : { assignedSmId: smId });
      setSelectedSm("");
      showToast("SM assigned");
      reload();
    } catch {
      showToast("Could not assign SM");
    } finally {
      setBusy(false);
    }
  };

  const handleClearAssignment = async (kind: "caller" | "sm") => {
    setBusy(true);
    try {
      await patchLead(kind === "caller" ? { assignedCallerId: null } : { assignedSmId: null });
      showToast(kind === "caller" ? "Caller cleared" : "SM cleared");
      reload();
    } catch {
      showToast("Could not update assignment");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteLead = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/crm/api/leads/${lead.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
      showToast("Lead deleted");
      router.push("/crm/leads");
    } catch {
      showToast("Could not delete lead");
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

  const handleVisitStatus = async (type: string, visitId?: number) => {
    setBusy(true);
    try {
      await postActivity({ type, visitId });
      showToast(ACTIVITY_LABELS[type] || "Visit updated");
      reload();
    } catch {
      showToast("Could not update visit");
    } finally {
      setBusy(false);
    }
  };

  const phone = (lead.whatsappNumber || lead.phone || "").replace(/\D/g, "");
  const waNumber = formatPhoneForWhatsApp(phone);
  const notesList = activities.filter((a) => a.type === "note");
  const latestVisit =
    visits
      .slice()
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || b.id - a.id)[0] ||
    null;

  const SECOND_VISIT_MESSAGE =
    "Great to see your interest! Would you like to bring your family for a second look this weekend? I can arrange a convenient time.";
  const shouldSuggestSecondVisit =
    !!latestFeedback &&
    (String(latestFeedback.interest || "").toLowerCase() === "hot" ||
      String(latestFeedback.likedProperty || "").toLowerCase() === "yes" ||
      latestFeedback.likedProperty === true);

  const requiredFieldsFilled = Boolean(lead.bhk && (lead.budget || (lead.budgetMin && lead.budgetMax)) && lead.location);

  const stageIndex = FUNNEL_STAGES.findIndex((s) => s.matches.includes(lead.status));
  const hasProgressed =
    activities.length > 1 ||
    followUps.length > 0 ||
    visits.length > 0 ||
    !["new", "calling", "connected", "no_response"].includes(lead.status);

  const scrollToSection = useCallback((id: string) => {
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }, []);

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
        {lead.assignedCallerName && (
          <Badge color="bg-sky-100 text-sky-800">Caller: {lead.assignedCallerName}</Badge>
        )}
        {lead.assignedSmName && (
          <Badge color="bg-violet-100 text-violet-800">SM: {lead.assignedSmName}</Badge>
        )}
      </div>

      {/* ===== Post-handoff read-only notice (caller) ===== */}
      {readOnly && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-sky-600">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <p className="text-xs font-semibold leading-snug text-sky-800">
            Handed off to {lead.assignedSmName || "the sales team"} — this lead is now managed by
            the sales team. You can still view the full history here, but editing is disabled.
          </p>
        </div>
      )}

      {/* ===== Two-column layout ===== */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      {/* ===== LEFT COLUMN ===== */}
      <div className="space-y-6 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">

      {/* ===== Contact row (2 primary actions) ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-white p-4">
        <div className="min-w-0">
          <a
            href={`tel:+${phone}`}
            className="block truncate text-sm font-semibold text-muted transition-colors hover:text-primary"
          >
            {phone || lead.phone || "—"}
          </a>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-soft">
            {lead.whatsappNumber && lead.whatsappNumber !== lead.phone && (
              <span>WhatsApp: <span className="font-medium text-muted">{lead.whatsappNumber}</span></span>
            )}
            {lead.email && (
              <span>Email: <span className="font-medium text-muted">{lead.email}</span></span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={`tel:+${phone}`}
            onClick={() => scrollToSection("call-outcome")}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-secondary"
          >
            <PhoneIcon />
            CALL
          </a>
          <a
            href={`https://wa.me/${waNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => scrollToSection("message-center")}
            className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-[#25D366]/30 transition-colors hover:bg-[#1DA851]"
          >
            <WhatsAppIcon />
            WhatsApp
          </a>
        </div>
      </div>

      {/* ===== Secondary actions (More Actions dropdown) ===== */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setMoreActionsOpen((s) => !s)}
          aria-expanded={moreActionsOpen}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2 text-xs font-bold text-navy transition-colors hover:bg-primary/5"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
          More Actions
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 transition-transform ${moreActionsOpen ? "rotate-180" : ""}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {moreActionsOpen && (
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setMoreActionsOpen(false)}
              className="fixed inset-0 z-30 cursor-default"
            />
            <div className="absolute left-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-white p-1.5 shadow-xl">
              <MoreAction
                label="Message Center"
                hint="Templates and WhatsApp"
                color="bg-blue-50 text-blue-700"
                onClick={() => { setMoreActionsOpen(false); scrollToSection("message-center"); }}
                icon={<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10ZM8 10h8" />}
              />
              {!readOnly && (
                <>
                  <MoreAction
                    label="Schedule Follow-up"
                    hint="Set next action"
                    color="bg-amber-50 text-amber-700"
                    onClick={() => { setMoreActionsOpen(false); const willShow = !showFollowUp; setShowFollowUp(willShow); if (willShow) scrollToSection("follow-up-form"); }}
                    icon={<path d="M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />}
                  />
                  <MoreAction
                    label="Book Site Visit"
                    hint="Schedule a project visit"
                    color="bg-emerald-50 text-emerald-700"
                    onClick={() => { setMoreActionsOpen(false); openVisit(); scrollToSection("visit-form"); }}
                    icon={<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>}
                  />
                </>
              )}
              <MoreAction
                label="Find Property"
                hint="Run the matching engine"
                color="bg-accent text-primary"
                onClick={() => { setMoreActionsOpen(false); setShowMatches(true); loadMatches(); scrollToSection("matching-properties"); }}
                icon={<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.35-4.35" /></>}
              />
              {!isCaller && hasProgressed && (
                <a
                  href={`/crm/leads/${lead.id}/negotiation`}
                  onClick={() => setMoreActionsOpen(false)}
                  className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-background"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-fuchsia-50 text-fuchsia-700">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <path d="M9 3H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1ZM20 3h-5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1ZM9 15H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1ZM20 15h-5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1Z" />
                    </svg>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-navy">Negotiation</span>
                    <span className="block text-[10px] text-soft">Open the negotiation workspace</span>
                  </span>
                </a>
              )}
            </div>
          </>
        )}
      </div>

      {/* ===== Site Visit action (stage-synced) ===== */}
      {!readOnly && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-primary">Site Visit</h3>
            {latestVisit && (
              <Badge color={visitStatusMeta(String(latestVisit.status)).cls}>
                {visitStatusMeta(String(latestVisit.status)).label}
              </Badge>
            )}
          </div>
          {latestVisit ? (
            <>
              <div className="rounded-xl bg-white px-3 py-2.5 text-sm">
                <div className="font-semibold text-navy">
                  {latestVisit.projectId || "Project TBD"} · {latestVisit.date || "Date TBD"}{" "}
                  {latestVisit.time || ""}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  SM: {latestVisit.smName || lead.assignedSmName || ""}
                  {latestVisit.meetingPoint ? ` · ${latestVisit.meetingPoint}` : ""}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {["proposed", "booked"].includes(String(latestVisit.status)) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleVisitStatus("visit_confirmed", latestVisit.id)}
                    className="rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    ✓ Confirm Visit
                  </button>
                )}
                {!["visit_done", "cancelled"].includes(String(latestVisit.status)) && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleVisitStatus("visit_done", latestVisit.id)}
                      className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      Mark Visit Done
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleVisitStatus("visit_no_show", latestVisit.id)}
                      className="rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50"
                    >
                      No Show
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleVisitStatus("visit_cancelled", latestVisit.id)}
                      className="rounded-xl border border-border bg-white px-3.5 py-2 text-xs font-bold text-muted transition-colors hover:bg-background disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                )}
                {["visit_done", "cancelled", "no_show"].includes(String(latestVisit.status)) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={openVisit}
                    className="rounded-xl border border-emerald-300 bg-white px-3.5 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
                  >
                    + Book Another Visit
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">
                No site visit yet. Book one to move this lead forward.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={openVisit}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Book Site Visit
              </button>
            </div>
          )}
        </div>
      )}

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
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-white p-4 scroll-mt-24" id="call-outcome" data-section="true">
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
                disabled={busy || readOnly}
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
                  disabled={busy || readOnly}
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

      {/* ===== Requirement card ===== */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-primary">Requirement</h3>
          {(isCaller || isAdmin) && !readOnly && (
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
          <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <p className="text-sm font-semibold leading-snug text-amber-800">
              Requirement is not complete yet — call and qualify the lead.
            </p>
          </div>
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

      </div>
      {/* ===== END LEFT COLUMN ===== */}

      {/* ===== RIGHT COLUMN ===== */}
      <div className="space-y-6 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">

      {/* ===== Notes (highlighted) ===== */}
      <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </span>
          <h3 className="text-sm font-bold text-primary">Notes</h3>
          {notesList.length > 0 && (
            <Badge color="bg-amber-100 text-amber-800">{notesList.length}</Badge>
          )}
          <span className="ml-auto text-[10px] text-soft">Call updates & reminders</span>
        </div>
        {notesList.length === 0 ? (
          <p className="rounded-xl bg-white/70 px-3 py-2 text-xs text-muted">No notes yet.</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto pr-0.5">
            {notesList.map((a) => (
              <div key={a.id} className="rounded-xl bg-white px-3 py-2 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-navy">{a.userName || ""}</span>
                  <span className="text-[10px] text-soft">{formatDateTime(a.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-sm text-navy">{a.notes}</p>
              </div>
            ))}
          </div>
        )}
        {!readOnly && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddNote();
              }}
              placeholder="Add a note..."
              className="flex-1 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm text-navy outline-none focus:border-primary"
            />
            <Button onClick={handleAddNote} disabled={busy || !note.trim()}>Add</Button>
          </div>
        )}
      </div>

      {/* ===== Status / funnel stepper ===== */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-primary">Lead Progress</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value=""
              disabled={busy || readOnly}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                handleStatusChange(v);
              }}
              className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-[11px] font-semibold text-muted focus:border-primary focus:outline-none"
            >
              <option value="">More statuses…</option>
              {OVERFLOW_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABELS[s] || s}
                </option>
              ))}
            </select>
            <select
              value=""
              disabled={busy || readOnly}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                if (v === "lost") {
                  setLostReason(getLeadLostReason(lead.notes) || "");
                  setLostNote("");
                  setShowLostPicker(true);
                } else {
                  handleStatusChange(v);
                }
              }}
              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 focus:border-red-400 focus:outline-none"
            >
              <option value="">Close lead…</option>
              {EXIT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-start">
          {FUNNEL_STAGES.map((stage, i) => {
            const done = stageIndex > i;
            const current = stageIndex === i;
            const reached = stageIndex >= i && stageIndex !== -1;
            return (
              <div key={stage.key} className="flex flex-1 flex-col items-center">
                <div className="flex w-full items-center">
                  <div className={`h-0.5 flex-1 ${i === 0 ? "bg-transparent" : reached ? "bg-primary" : "bg-border"}`} />
                  <button
                    type="button"
                    disabled={busy || readOnly}
                    onClick={() => {
                      if (current) return;
                      handleStatusChange(stage.status);
                    }}
                    title={`Move to ${stage.label}`}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors disabled:opacity-60 ${
                      current
                        ? "bg-primary text-white ring-4 ring-primary/15"
                        : done
                          ? "bg-emerald-500 text-white hover:bg-emerald-600"
                          : "border border-border bg-white text-soft hover:border-primary hover:text-primary"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </button>
                  <div className={`h-0.5 flex-1 ${i === FUNNEL_STAGES.length - 1 ? "bg-transparent" : done ? "bg-primary" : "bg-border"}`} />
                </div>
                <span
                  className={`mt-1.5 text-center text-[10px] font-semibold leading-tight ${
                    current ? "text-primary" : done ? "text-emerald-600" : "text-soft"
                  }`}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-[11px]">
          <span className="text-soft">Current:</span>
          <Badge color={LEAD_STATUS_COLORS[lead.status] || "bg-primary/10 text-primary"}>{LEAD_STATUS_LABELS[lead.status] || lead.status}</Badge>
          {lead.status === "lost" && (
            <span className="text-red-600">· {getLeadLostReason(lead.notes) || "No reason"}</span>
          )}
        </div>
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

      {/* ===== Lead Tag ===== */}
      <div className="rounded-2xl border border-primary/15 bg-white p-4">
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

        {/* ===== Admin Zone: lead assignment + admin controls ===== */}
        {canAssign && !readOnly && (
          <section className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/40 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="text-sm font-bold text-amber-800">Admin Zone</h3>
                <Badge color="bg-amber-100 text-amber-800">Lead Assignment</Badge>
                {lead.assignedCallerName && (
                  <Badge color="bg-sky-100 text-sky-800">Caller: {lead.assignedCallerName}</Badge>
                )}
                {lead.assignedSmName && (
                  <Badge color="bg-violet-100 text-violet-800">SM: {lead.assignedSmName}</Badge>
                )}
                {!lead.assignedCallerId && !lead.assignedSmId && (
                  <Badge color="bg-gray-100 text-gray-600">Unassigned</Badge>
                )}
              </div>
              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setShowEdit(true)}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-bold text-amber-800 transition-colors hover:bg-amber-100"
                  >
                    ✎ Edit Lead
                  </button>
                  <button
                    onClick={() => setShowDelete(true)}
                    className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-[11px] font-bold text-red-700 transition-colors hover:bg-red-100"
                  >
                    Delete Lead
                  </button>
                </div>
              )}
            </div>

            {/* Caller */}
            {canAssignCaller && (
              <div className="rounded-xl bg-white/70 p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-navy">Caller</span>
                  {lead.assignedCallerName && (
                    <button
                      onClick={() => handleClearAssignment("caller")}
                      disabled={busy}
                      className="text-[10px] font-semibold text-red-600 hover:underline disabled:opacity-50"
                    >
                      Clear caller
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    value={selectedCaller}
                    onChange={(e) => setSelectedCaller(e.target.value ? Number(e.target.value) : "")}
                    className="flex-1 rounded-xl border border-sky-300 bg-white px-3 py-2 text-sm text-navy outline-none"
                  >
                    <option value="">
                      {lead.assignedCallerName ? `Current: ${lead.assignedCallerName}` : "Select caller..."}
                    </option>
                    {callerUsers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.id === lead.assignedCallerId ? " (current)" : ""}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => handleAssignCaller("auto")}
                      disabled={busy || callerUsers.length === 0}
                    >
                      Auto
                    </Button>
                    <Button
                      onClick={() => selectedCaller !== "" && handleAssignCaller(selectedCaller as number)}
                      disabled={busy || selectedCaller === ""}
                    >
                      Assign
                    </Button>
                  </div>
                </div>
                {selectedCaller && <WorkloadTiles w={callers[selectedCaller]} />}
              </div>
            )}

            {/* Sales Manager */}
            <div className={`rounded-xl bg-white/70 p-3 ${canAssignCaller ? "mt-2.5" : ""}`}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-bold text-navy">Sales Manager</span>
                {lead.assignedSmName && (
                  <button
                    onClick={() => handleClearAssignment("sm")}
                    disabled={busy}
                    className="text-[10px] font-semibold text-red-600 hover:underline disabled:opacity-50"
                  >
                    Clear SM
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={selectedSm}
                  onChange={(e) => setSelectedSm(e.target.value ? Number(e.target.value) : "")}
                  className="flex-1 rounded-xl border border-violet-300 bg-white px-3 py-2 text-sm text-navy outline-none"
                >
                  <option value="">
                    {lead.assignedSmName ? `Current: ${lead.assignedSmName}` : "Select SM..."}
                  </option>
                  {smUsers.map((sm) => (
                    <option key={sm.id} value={sm.id}>
                      {sm.name}
                      {sm.id === lead.assignedSmId ? " (current)" : ""}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => handleAssignSm("auto")}
                    disabled={busy || smUsers.length === 0}
                  >
                    Auto
                  </Button>
                  <Button
                    onClick={() => selectedSm !== "" && handleAssignSm(selectedSm as number)}
                    disabled={busy || selectedSm === ""}
                  >
                    Assign
                  </Button>
                </div>
              </div>
              {selectedSm && <WorkloadTiles w={sms[selectedSm]} />}
            </div>
          </section>
        )}

      {/* ===== SM Handoff ===== */}
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
      {/* ===== END RIGHT COLUMN ===== */}
      </div>
      {/* ===== END TWO-COLUMN LAYOUT ===== */}

      {/* ===== Property matches ===== */}
      {(showMatches || matches.length > 0) && (
        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 scroll-mt-24" id="matching-properties" data-section="true">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-primary">Matching Properties</h3>
            {!readOnly && (
              <button
                type="button"
                disabled={busy}
                onClick={() => { setShowMatches(true); refreshMatches(); }}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                Recommend Property
              </button>
            )}
          </div>
          {matches.length === 0 ? (
            <p className="text-xs text-muted">
              Complete the requirement (budget, location, BHK) then tap Recommend Property to see
              the best matches.
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
                    {m.reasons.map((r, i) => {
                      const tone = r.tone ?? (r.ok ? "good" : "bad");
                      const cls =
                        tone === "good"
                          ? "bg-emerald-50 text-emerald-700"
                          : tone === "warn"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-red-50 text-red-600";
                      const mark = tone === "good" ? "✓" : tone === "bad" ? "✗" : "!";
                      return (
                        <span
                          key={i}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}
                        >
                          {mark} {r.label}
                        </span>
                      );
                    })}
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
        <form onSubmit={handleFollowUp} id="follow-up-form" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 scroll-mt-24">
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
        <form onSubmit={handleVisit} id="visit-form" className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 scroll-mt-24">
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

      {/* ===== Lower detail grid (2 columns) ===== */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Call history */}
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

        {/* Site Visits */}
        {visits.length > 0 && (
          <div className="rounded-2xl border border-border bg-white p-4">
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
                  <Badge color={visitStatusMeta(String(v.status)).cls}>
                    {visitStatusMeta(String(v.status)).label}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Follow-ups */}
        {followUps.length > 0 && (
          <div className="rounded-2xl border border-border bg-white p-4">
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

        {/* Activity timeline */}
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

      {/* ===== Edit lead modal ===== */}
      {showEdit && (
        <LeadEditor lead={lead} onSave={handleSaveEdit} onCancel={() => setShowEdit(false)} />
      )}

      {/* ===== Delete lead modal ===== */}
      {showDelete && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-5">
            <h3 className="text-sm font-bold text-red-700">Delete this lead?</h3>
            <p className="mt-1 text-xs text-muted">
              <span className="font-semibold text-navy">{lead.name}</span> will be marked as invalid
              (soft delete) — it stops appearing in all lists while the audit trail is kept.
            </p>
            <div className="mt-4 flex gap-2">
              <Button onClick={handleDeleteLead} disabled={busy}>
                Yes, delete
              </Button>
              <Button variant="ghost" onClick={() => setShowDelete(false)}>
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
      if (showMatches || matchesLoaded) {
        setShowMatches(true);
        await refreshMatches();
      }
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

  async function handleSaveEdit(vals: Record<string, any>) {
    setBusy(true);
    try {
      await patchLead(vals);
      await postActivity({ type: "note", notes: "Lead details edited" });
      showToast("Lead updated");
      setShowEdit(false);
      reload();
    } catch {
      showToast("Could not save");
    } finally {
      setBusy(false);
    }
  }
}

function WorkloadTiles({ w }: { w: any }) {
  if (!w) {
    return <p className="mt-3 text-xs text-muted">Loading workload...</p>;
  }
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[
        ["Active Leads", w.activeLeads],
        ["Today's Follow-ups", w.todaysFollowUps],
        ["Visits Upcoming", w.upcomingVisits],
        ["Overdue", w.overdueFollowUps],
      ].map(([label, val]) => (
        <div key={label as string} className="rounded-xl bg-white px-3 py-2 text-center">
          <div className="text-lg font-bold text-navy">{val}</div>
          <div className="text-[10px] text-soft">{label}</div>
        </div>
      ))}
    </div>
  );
}

function MoreAction({
  label,
  hint,
  color,
  icon,
  onClick,
}: {
  label: string;
  hint: string;
  color: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-background"
    >
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${color}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          {icon}
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold text-navy">{label}</span>
        <span className="block text-[10px] text-soft">{hint}</span>
      </span>
    </button>
  );
}

const LEAD_SOURCES = [
  { value: "meta", label: "Meta" },
  { value: "facebook", label: "Facebook" },
  { value: "google", label: "Google" },
  { value: "website", label: "Website" },
  { value: "walk_in", label: "Walk-in" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" },
];

function LeadEditor({
  lead,
  onSave,
  onCancel,
}: {
  lead: Record<string, any>;
  onSave: (vals: Record<string, any>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: lead.name || "",
    phone: lead.phone || "",
    whatsappNumber: lead.whatsappNumber || "",
    email: lead.email || "",
    source: lead.source || "meta",
    campaignName: lead.campaignName || "",
    adSetName: lead.adSetName || "",
    adName: lead.adName || "",
  });

  const input =
    "w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-navy outline-none focus:border-primary";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name: form.name.trim(),
      phone: form.phone.trim(),
      whatsappNumber: form.whatsappNumber.trim() || null,
      email: form.email.trim() || null,
      source: form.source,
      campaignName: form.campaignName.trim() || null,
      adSetName: form.adSetName.trim() || null,
      adName: form.adName.trim() || null,
    });
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <form
        onSubmit={submit}
        className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5"
      >
        <h3 className="text-sm font-bold text-primary">Edit Lead</h3>
        <p className="mt-0.5 text-xs text-muted">
          Update contact and acquisition details for this lead.
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">WhatsApp Number</label>
              <input value={form.whatsappNumber} onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })} className={input} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Source</label>
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className={input}>
                {LEAD_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Campaign</label>
              <input value={form.campaignName} onChange={(e) => setForm({ ...form, campaignName: e.target.value })} className={input} placeholder="e.g. WhatsApp - Vasai Towers" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Ad Set</label>
              <input value={form.adSetName} onChange={(e) => setForm({ ...form, adSetName: e.target.value })} className={input} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Ad Name</label>
              <input value={form.adName} onChange={(e) => setForm({ ...form, adName: e.target.value })} className={input} />
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button type="submit">Save</Button>
          <Button variant="ghost" onClick={onCancel} type="button">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

const BUDGET_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: "Under ₹25L", min: null, max: 25 },
  { label: "₹25–40L", min: 25, max: 40 },
  { label: "₹40–60L", min: 40, max: 60 },
  { label: "₹60–85L", min: 60, max: 85 },
  { label: "₹85L+", min: 85, max: null },
];

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
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Budget Range</label>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {BUDGET_PRESETS.map((p) => {
            const active =
              String(p.min ?? "") === form.budgetMin && String(p.max ?? "") === form.budgetMax;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    budgetMin: p.min == null ? "" : String(p.min),
                    budgetMax: p.max == null ? "" : String(p.max),
                  })
                }
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  active
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-white text-muted hover:border-primary hover:text-primary"
                }`}
              >
                {p.label}
              </button>
            );
          })}
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

function visitStatusMeta(status: string): { label: string; cls: string } {
  switch (status) {
    case "proposed":
      return { label: "Proposed", cls: "bg-cyan-100 text-cyan-800" };
    case "booked":
      return { label: "Booked", cls: "bg-teal-100 text-teal-800" };
    case "confirmed":
      return { label: "Confirmed", cls: "bg-teal-200 text-teal-900" };
    case "arrived":
      return { label: "Arrived", cls: "bg-sky-100 text-sky-800" };
    case "visit_done":
      return { label: "Visit Done", cls: "bg-green-100 text-green-800" };
    case "no_show":
      return { label: "No Show", cls: "bg-red-100 text-red-700" };
    case "cancelled":
      return { label: "Cancelled", cls: "bg-slate-100 text-slate-600" };
    default:
      return { label: status || "—", cls: "bg-background text-muted" };
  }
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