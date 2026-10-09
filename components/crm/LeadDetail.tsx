"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, PhoneIcon, WhatsAppIcon } from "./ui";
import {
  LEAD_STATUS_LABELS,
  LEAD_LOST_REASONS,
  ACTIVITY_LABELS,
  lostReasonLabel,
  getLeadLostReason,
  setLeadLostReasonInNotes,
  bhkLabel,
} from "@/lib/crm/leads";
import { LEAD_COLUMNS, columnForStatus, sourceLabel } from "@/lib/crm/board-shared";
import { formatPhoneForWhatsApp } from "@/lib/crm/messages";
import { formatCallDuration } from "@/lib/crm/call-sessions-shared";
import { useCallSession } from "./useCallSession";
import { matchLevelMeta, type PropertyMatch } from "@/lib/crm/matching";
import { SUB_LOCATIONS, priceValidityInfo } from "@/lib/projects";
import { DEFAULT_BUDGET_PRESETS, type BudgetPreset } from "@/lib/crm/budget";
import SiteVisitModal, {
  parseShown,
  shownSummary,
  type RecommendedProperty,
  type ShownProperty,
  type VisitRecord,
} from "./SiteVisitModal";

export type LeadDetailData = {
  lead: Record<string, any>;
  activities: any[];
  followUps: any[];
  visits: any[];
  users: { id: number; name: string; role: string }[];
  latestFeedback: Record<string, any> | null;
  duplicates: { id: number; name: string; phone: string; reason: string }[];
  propertyOptions: string[];
};

/** The four outcomes a caller picks after dialling. */
const CALL_OUTCOMES = [
  { type: "call_connected", label: "Answered" },
  { type: "call_no_answer", label: "Not Answered" },
  { type: "call_busy", label: "Busy" },
  { type: "call_wrong_number", label: "Wrong Number" },
] as const;

/**
 * The remaining outcome types still feed the reports and leaderboard, so they
 * stay reachable behind one link instead of filling the popup with nine buttons.
 */
const CALL_OUTCOMES_EXTRA = [
  { type: "call_not_interested", label: "Not Interested" },
  { type: "call_switched_off", label: "Switched Off" },
  { type: "call_number_invalid", label: "Number Invalid" },
  { type: "call_whatsapp_only", label: "Requested WhatsApp Only" },
  { type: "call_language_barrier", label: "Language Barrier" },
  { type: "call_back", label: "Call Back" },
  { type: "call_other", label: "Other" },
] as const;

const CONCERN_OPTIONS = [
  { v: "budget", l: "Budget too high" },
  { v: "location", l: "Location not preferred" },
  { v: "bhk", l: "BHK size" },
  { v: "possession", l: "Possession time" },
  { v: "comparing", l: "Comparing with others" },
];

/** Lead detail is tabbed so the page is not one endless stack of cards. */
type DetailTabKey = "notes" | "activity" | "visits" | "messages";

const DETAIL_TABS: { key: DetailTabKey; label: string }[] = [
  { key: "notes", label: "Notes" },
  { key: "activity", label: "Activity" },
  { key: "visits", label: "Site Visits" },
  { key: "messages", label: "Messages" },
];

function reactivationPreviousLabel(from: string | null | undefined): string {
  if (!from) return "";
  if (from === "deleted") return "Inactive";
  return LEAD_STATUS_LABELS[from] || from;
}

function reactivationDateLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

/** The attempt attached to a call activity, when one was timed. */
type CallLogView = {
  direction?: string | null;
  durationSeconds: number | null;
  recordingUrl?: string | null;
};

type Props = {
  data: LeadDetailData;
  currentUser: { id: number; role: string; name: string; seeAllLeads?: boolean };
  initialVisitOpen?: boolean;
  /** Rendered inside the "Messages" tab by the server page. */
  messageCenter?: React.ReactNode;
  /** Admin-configured budget chips; falls back to the built-in ranges. */
  budgetPresets?: BudgetPreset[];
};

export default function LeadDetail({ data, currentUser, initialVisitOpen, messageCenter, budgetPresets = DEFAULT_BUDGET_PRESETS }: Props) {
  const [lead, setLead] = useState(data.lead);
  const [activities, setActivities] = useState(data.activities);
  const [followUps, setFollowUps] = useState(data.followUps);
  const [visits, setVisits] = useState(data.visits);
  const [latestFeedback, setLatestFeedback] = useState(data.latestFeedback);
  const [toast, setToast] = useState("");
  const [note, setNote] = useState("");
  const [tagShown, setTagShown] = useState(false);
  const [tagText, setTagText] = useState("");
  const [tagLogged, setTagLogged] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [showVisit, setShowVisit] = useState(Boolean(initialVisitOpen));
  const [selectedSm, setSelectedSm] = useState<number | "">("");
  const [selectedCaller, setSelectedCaller] = useState<number | "">("");
  const [sms, setSms] = useState<Record<number, any>>({});
  const [callers, setCallers] = useState<Record<number, any>>({});
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [matches, setMatches] = useState<PropertyMatch[]>([]);
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
  const [visitStartView, setVisitStartView] = useState<"book" | "manage" | null>(null);
  const [tab, setTab] = useState<DetailTabKey>("notes");

  // Call result popup state.
  const [showCallResult, setShowCallResult] = useState(false);
  const [callOutcome, setCallOutcome] = useState<string>("");
  const [callNote, setCallNote] = useState("");
  const [callNextDate, setCallNextDate] = useState("");
  const [showMoreOutcomes, setShowMoreOutcomes] = useState(false);

  // Opened by the Call tap, closed by the outcome save.
  const call = useCallSession(lead.id, "lead_detail");

  const smUsers = data.users.filter((u) => u.role === "sales_manager");
  const callerUsers = data.users.filter((u) => u.role === "caller");
  const isCaller = currentUser.role === "caller";
  const isAdmin = currentUser.role === "admin" || currentUser.role === "sales_head";
  // Callers may edit every lead, including one already handed off to an SM:
  // the view never becomes read-only for them. Handing a lead to an SM is a
  // caller action too. Reassigning a caller, auto-assign and delete stay
  // owner/admin controls, and an SM keeps today's behaviour — only an admin
  // may move a lead sideways.
  const canAssignSm = isAdmin || isCaller;
  const canManageAssignment = isAdmin;
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
    if (!canAssignSm && !canManageAssignment) return;
    fetch("/crm/api/team/assignees")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setSms(Object.fromEntries(d.sms.map((s: any) => [s.id, s])));
          setCallers(Object.fromEntries(d.callers.map((c: any) => [c.id, c])));
        }
      })
      .catch(() => {});
  }, [canAssignSm, canManageAssignment]);

  const refreshMatches = useCallback(async () => {
    try {
      const res = await fetch(`/crm/api/leads/${lead.id}/matches`);
      if (res.ok) {
        const d = await res.json();
        setMatches(d.matches);
      }
    } catch {
      // keep the existing matches if the refresh fails
    }
  }, [lead.id]);

  const requiredFieldsFilled = Boolean(
    lead.bhk && (lead.budget || (lead.budgetMin && lead.budgetMax)) && lead.location
  );

  // Recommendations are visible by default — fetch matches as soon as the
  // requirement is complete, no need to tap "Recommend Property".
  const autoMatchedRef = useRef(false);
  useEffect(() => {
    if (requiredFieldsFilled && !autoMatchedRef.current) {
      autoMatchedRef.current = true;
      refreshMatches();
    }
  }, [requiredFieldsFilled, refreshMatches]);

  const hasProgressed =
    activities.length > 1 ||
    followUps.length > 0 ||
    visits.length > 0 ||
    !["new", "calling", "connected", "initial_contact", "no_response"].includes(lead.status);

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
      showToast(`Status → ${LEAD_STATUS_LABELS[status] || status}`);
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

  /** Stage bar: a column click lands the lead on that group's entry status. */
  const handleColumnClick = async (columnKey: string) => {
    const column = LEAD_COLUMNS.find((c) => c.key === columnKey);
    if (!column) return;
    if (column.closed) {
      setLostReason(getLeadLostReason(lead.notes) || "");
      setLostNote("");
      setShowLostPicker(true);
      return;
    }
    if (lead.status === column.dropStatus) return;
    await handleStatusChange(column.dropStatus);
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

  /**
   * One call result, one request. The activities route already turns a
   * `scheduledFollowUp` on a call outcome into a pending follow-up, so the note
   * and the next date ride along with the outcome.
   */
  const handleSaveCallResult = async () => {
    if (!callOutcome) return;
    setBusy(true);
    try {
      const base = {
        type: callOutcome,
        notes: callNote.trim(),
        // Present only when a Call tap opened a session. Without it the route
        // still records the attempt, just with no timing.
        ...(call.sessionId ? { callSessionId: call.sessionId } : {}),
      };
      if (callOutcome === "call_back") {
        await postActivity(
          callNextDate
            ? { ...base, callbackTime: callNextDate }
            : { ...base, callbackTime: new Date().toISOString() }
        );
      } else {
        await postActivity(
          callNextDate
            ? {
                ...base,
                scheduledFollowUp: callNextDate,
                followUpPurpose: "Follow-up after call",
              }
            : base
        );
      }
      showToast(ACTIVITY_LABELS[callOutcome] || "Call logged");
      call.clear();
      setShowCallResult(false);
      setCallOutcome("");
      setCallNote("");
      setCallNextDate("");
      setShowMoreOutcomes(false);
      reload();
    } catch {
      showToast("Could not log the call");
    } finally {
      setBusy(false);
    }
  };

  const handleBookVisit = async (payload: {
    visitDate: string;
    visitTime: string;
    projectId: string;
    meetingPoint: string;
    notes: string;
    recommendedProperties: RecommendedProperty[];
  }) => {
    setBusy(true);
    try {
      await postActivity({
        type: "visit_booked",
        visitDate: payload.visitDate,
        visitTime: payload.visitTime,
        meetingPoint: payload.meetingPoint,
        projectId: payload.projectId,
        recommendedProperties: payload.recommendedProperties,
        smId: lead.assignedSmId || currentUser.id,
        notes: payload.notes,
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

  const handleVisitDone = async (visitId: number, propertiesShown: ShownProperty[]) => {
    setBusy(true);
    try {
      await postActivity({ type: "visit_done", visitId, propertiesShown });
      showToast("Visit marked done");
      setShowVisit(false);
      reload();
    } catch {
      showToast("Could not update visit");
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

  const handleSaveEdit = async (vals: Record<string, any>) => {
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
  };

  const handleGenerateTag = async () => {
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
  };

  const handleCopyTag = async () => {
    try {
      await navigator.clipboard.writeText(tagText);
      showToast("Tag copied");
      postActivity({ type: "tag_copied", notes: "Lead tag copied" }).catch(() => {});
    } catch {
      showToast("Could not copy. Please select manually.");
    }
  };

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
    setVisitStartView(null);
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
    setVisitStartView("book");
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

  const phone = (lead.whatsappNumber || lead.phone || "").replace(/\D/g, "");
  const waNumber = formatPhoneForWhatsApp(phone);
  // Newest first. Sorted on a copy so the underlying activity order is untouched.
  const notesList = useMemo(
    () =>
      activities
        .filter((a) => a.type === "note")
        .slice()
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    [activities]
  );
  const callHistory = activities.filter((a) => String(a.type).startsWith("call"));
  const latestVisit =
    visits
      .slice()
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || b.id - a.id)[0] ||
    null;

  const recommendedProperties: RecommendedProperty[] = matches.map((m) => ({
    slug: m.projectSlug,
    title: m.title,
  }));

  const SECOND_VISIT_MESSAGE =
    "Great to see your interest! Would you like to bring your family for a second look this weekend? I can arrange a convenient time.";
  const shouldSuggestSecondVisit =
    !!latestFeedback &&
    (String(latestFeedback.interest || "").toLowerCase() === "hot" ||
      String(latestFeedback.likedProperty || "").toLowerCase() === "yes" ||
      latestFeedback.likedProperty === true);

  const currentColumn = columnForStatus(String(lead.status));
  const project = lead.preferredProject || lead.originalProject || "";

  const callOutcomeButton =
    "rounded-xl border px-3 py-2 text-sm font-semibold transition-colors";

  // `contactHidden` is decided server-side; the lead payload already holds the
  // masked string when it is true, so the tap-to-dial links must be disabled.
  const contactsHidden = !!(lead as { contactHidden?: boolean }).contactHidden;

  const actionProps = {
    phone,
    waNumber,
    onCall: () => {
      void call.begin("phone", phone);
      setShowCallResult(true);
    },
    onVisit: openVisit,
    busy,
    contactsHidden,
  };

  /** Left card: a fixed 320px column, so ~90px per column once the gaps are in.
      Three labels do not fit there, so it always takes the stacked fallback. */
  const cardActions = <LeadActions layout="card" {...actionProps} />;

  /** Mobile bar: full width, so three equal columns from 360px up. Below that
      the labels would wrap, so it stacks rather than shrinking. */
  const mobileActions = <LeadActions layout="bar" {...actionProps} />;

  return (
    // The mobile action bar is one 48px row from 360px up, but three stacked
    // rows below that (176px), on top of the 60px bottom nav. Reserve room so
    // the last card is never hidden behind it.
    <div className="pb-[240px] min-[360px]:pb-32 lg:pb-6">
      {toast && (
        <div className="fixed left-1/2 top-16 z-[100] -translate-x-1/2 rounded-xl bg-navy px-2.5 py-2.5 text-sm font-medium text-white shadow-2xl">
          {toast}
        </div>
      )}

      {/* ===== Clickable stage bar: one control for all eleven columns ===== */}
      <div
        role="group"
        aria-label="Lead stage"
        className="-mx-4 mt-6 flex gap-2 overflow-x-auto border-b border-border px-4 pb-3 md:mx-0 md:px-0 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {LEAD_COLUMNS.map((column) => {
          const isCurrent = currentColumn?.key === column.key;
          return (
            <button
              key={column.key}
              type="button"
              disabled={busy}
              onClick={() => handleColumnClick(column.key)}
              aria-current={isCurrent ? "true" : undefined}
              title={`Move to ${column.label}`}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                isCurrent
                  ? "bg-primary text-white"
                  : "border border-border bg-white text-muted hover:bg-primary/5 hover:text-primary"
              }`}
            >
              {column.label}
            </button>
          );
        })}
      </div>

      {lead.reactivatedAt && (
        <p className="mt-4 text-sm text-muted">
          Reactivated on {reactivationDateLabel(lead.reactivatedAt)}
          {lead.reactivatedFrom ? `, previously ${reactivationPreviousLabel(lead.reactivatedFrom)}` : ""}
        </p>
      )}

      <div className="mt-6 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* ===== Left: identity card ===== */}
        <div className="rounded-xl border border-border bg-white p-4">
          {project && (
            <p className="text-base font-bold text-navy">{project}</p>
          )}
          {contactsHidden ? (
            <>
              <p
                className={`${project ? "mt-1.5" : ""} truncate text-sm font-semibold text-amber-800`}
              >
                {lead.phone || "—"}
              </p>
              {lead.whatsappNumber && lead.whatsappNumber !== lead.phone && (
                <p className="mt-1 truncate text-sm text-amber-800">WA: {lead.whatsappNumber}</p>
              )}
            </>
          ) : (
            <>
              <a
                href={`tel:+${phone}`}
                className={`${project ? "mt-1.5" : ""} block truncate text-sm font-semibold text-primary hover:underline`}
              >
                {lead.phone || "—"}
              </a>
              {lead.whatsappNumber && lead.whatsappNumber !== lead.phone && (
                <p className="mt-1 truncate text-sm text-navy">WA: {lead.whatsappNumber}</p>
              )}
            </>
          )}
          {lead.email &&
            (contactsHidden ? (
              <p className="mt-1 truncate text-sm text-amber-800">{lead.email}</p>
            ) : (
              <a
                href={`mailto:${lead.email}`}
                className="mt-1 block truncate text-sm text-navy hover:underline"
              >
                {lead.email}
              </a>
            ))}

          <dl className="mt-4 space-y-2 border-t border-border pt-4">
            <DetailRow label="Source" value={sourceLabel(lead.source)} />
            <DetailRow label="Caller" value={lead.assignedCallerName || "Unassigned"} />
            <DetailRow label="SM" value={lead.assignedSmName || "Unassigned"} />
            <DetailRow label="Location" value={locationLabel(lead.location)} />
            <DetailRow label="Budget" value={budgetLabel(lead)} />
            <DetailRow label="BHK" value={bhkLabel(lead.bhk)} />
          </dl>

          <div className="mt-4 hidden lg:block">{cardActions}</div>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Edit Details
            </button>
          </div>

          {/* Handing off to an SM is a caller action too; caller reassignment,
              auto-assign and delete stay owner/admin controls. */}
          {(canAssignSm || canManageAssignment) && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => setShowAssign((s) => !s)}
                aria-expanded={showAssign}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-primary/5"
              >
                {showAssign ? "Hide Assignment" : "Assign Lead"}
              </button>
              {showAssign && (
                <div className="mt-2.5 space-y-3 border-t border-border pt-3">
                  {canManageAssignment && (
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-navy">Caller</span>
                        {lead.assignedCallerName && (
                          <button
                            type="button"
                            onClick={() => handleClearAssignment("caller")}
                            disabled={busy}
                            className="text-sm font-semibold text-primary hover:underline disabled:opacity-50"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="mt-1.5 flex gap-2">
                        <select
                          value={selectedCaller}
                          onChange={(e) =>
                            setSelectedCaller(e.target.value ? Number(e.target.value) : "")
                          }
                          className="min-w-0 flex-1 rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-primary"
                        >
                          <option value="">
                            {lead.assignedCallerName || "Select caller..."}
                          </option>
                          {callerUsers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          onClick={() =>
                            selectedCaller !== "" && handleAssignCaller(selectedCaller as number)
                          }
                          disabled={busy || selectedCaller === ""}
                        >
                          Assign
                        </Button>
                      </div>
                      {selectedCaller && <WorkloadTiles w={callers[selectedCaller]} />}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-navy">Sales Manager</span>
                      {lead.assignedSmName && canManageAssignment && (
                        <button
                          type="button"
                          onClick={() => handleClearAssignment("sm")}
                          disabled={busy}
                          className="text-sm font-semibold text-primary hover:underline disabled:opacity-50"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="mt-1.5 flex gap-2">
                      <select
                        value={selectedSm}
                        onChange={(e) => setSelectedSm(e.target.value ? Number(e.target.value) : "")}
                        className="min-w-0 flex-1 rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-primary"
                      >
                        <option value="">{lead.assignedSmName || "Select SM..."}</option>
                        {smUsers.map((sm) => (
                          <option key={sm.id} value={sm.id}>
                            {sm.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        onClick={() => selectedSm !== "" && handleAssignSm(selectedSm as number)}
                        disabled={busy || selectedSm === ""}
                      >
                        Assign
                      </Button>
                    </div>
                    {selectedSm && <WorkloadTiles w={sms[selectedSm]} />}
                  </div>

                  {canManageAssignment && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleAssignCaller("auto")}
                        disabled={busy || callerUsers.length === 0}
                      >
                        Auto Caller
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleAssignSm("auto")}
                        disabled={busy || smUsers.length === 0}
                      >
                        Auto SM
                      </Button>
                    </div>
                  )}

                  {canManageAssignment && (
                    <div className="flex gap-2 border-t border-border pt-3">
                      <Button size="sm" variant="ghost" onClick={() => setShowDelete(true)}>
                        Delete Lead
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ===== Right: Notes / Activity / Site Visits / Messages ===== */}
        <div className="mt-4 lg:mt-0">
          <div
            role="tablist"
            aria-label="Lead detail sections"
            className="flex gap-2 overflow-x-auto border-b border-border [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {DETAIL_TABS.map((t) => {
              const count =
                t.key === "notes"
                  ? notesList.length
                  : t.key === "activity"
                    ? activities.length
                    : t.key === "visits"
                      ? visits.length
                      : 0;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  id={`lead-tab-${t.key}`}
                  aria-selected={tab === t.key}
                  aria-controls={`lead-tabpanel-${t.key}`}
                  onClick={() => setTab(t.key)}
                  className={`-mb-px shrink-0 border-b-2 px-4 py-3 text-sm font-bold transition-colors ${
                    tab === t.key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted hover:border-border hover:text-navy"
                  }`}
                >
                  {t.label}
                  {count > 0 && (
                    <span className="ml-2 rounded-full bg-gray-100 px-2 text-sm font-semibold leading-6 text-muted">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {tab === "notes" && (
            <div role="tabpanel" id="lead-tabpanel-notes" aria-labelledby="lead-tab-notes" className="mt-4">
              {/* Composer sits on top, as in Bigin. The 16px card padding keeps
                  the focus outline (offset 2px) clear of the note cards. */}
              <div className="rounded-xl border border-border bg-white p-4">
                <div className="flex gap-3">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddNote();
                    }}
                    placeholder="Add a note..."
                    className="min-w-0 flex-1 rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-navy focus:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  />
                  <Button onClick={handleAddNote} disabled={busy || !note.trim()} className="shrink-0">
                    Add
                  </Button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {notesList.length === 0 ? (
                  <p className="rounded-xl border border-border bg-white p-4 text-sm text-muted">
                    No notes yet.
                  </p>
                ) : (
                  notesList.map((a) => (
                    <div key={a.id} className="rounded-xl border border-border bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-navy">{a.userName || ""}</span>
                        <span className="text-sm text-soft">{formatDateTime(a.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-sm text-navy">{a.notes}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === "activity" && (
            <div role="tabpanel" id="lead-tabpanel-activity" aria-labelledby="lead-tab-activity" className="mt-4 space-y-5">
              {lead.status === "lost" && (
                <div className="rounded-xl border border-border bg-white px-4 py-3">
                  <p className="text-sm text-navy">
                    <span className="font-semibold">Lead lost:</span>{" "}
                    {getLeadLostReason(lead.notes) || "No reason recorded"}
                  </p>
                </div>
              )}

              {lead.concern && (
                <div className="rounded-xl border border-border bg-white px-4 py-3">
                  <p className="text-sm text-navy">
                    <span className="font-semibold">Concern:</span> {lead.concern}
                  </p>
                </div>
              )}

              {/* Follow-ups */}
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-navy">Follow-ups</h3>
                  <button
                    type="button"
                    onClick={() => setShowFollowUp((s) => !s)}
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    {showFollowUp ? "Cancel" : "Schedule"}
                  </button>
                </div>
                {showFollowUp && (
                  <form onSubmit={handleFollowUp} className="mt-2.5 space-y-3 rounded-xl border border-border bg-white p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-semibold text-muted">Date & Time</label>
                        <input
                          type="datetime-local"
                          name="scheduledFor"
                          required
                          className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-semibold text-muted">Purpose</label>
                        <input
                          type="text"
                          name="purpose"
                          defaultValue="Follow-up - Property options"
                          className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-muted">Note</label>
                      <textarea
                        name="followNote"
                        rows={2}
                        className="w-full resize-none rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-primary"
                      />
                    </div>
                    <Button type="submit" disabled={busy}>
                      Schedule
                    </Button>
                  </form>
                )}
                {followUps.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No follow-ups scheduled.</p>
                ) : (
                  <div className="mt-2.5 space-y-2">
                    {followUps.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3"
                      >
                        <div className="text-sm">
                          <div className="font-semibold text-navy">{f.purpose || "Follow-up"}</div>
                          <div className="text-muted">{formatDateTime(f.scheduledFor)}</div>
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
                )}
              </div>

              {/* Call history */}
              {callHistory.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-navy">Call History</h3>
                  <div className="mt-2.5 space-y-2">
                    {callHistory.slice(0, 10).map((a) => {
                      const log = (a as { callLog?: CallLogView | null }).callLog;
                      return (
                        <div
                          key={a.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3"
                        >
                          <div className="min-w-0 text-sm">
                            <span className="font-semibold text-navy">
                              {ACTIVITY_LABELS[a.type] || a.type}
                            </span>
                            {log?.direction === "inbound" && (
                              <span className="ml-2 rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">
                                Incoming
                              </span>
                            )}
                            {log && (
                              <span className="ml-2 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                                {formatCallDuration(log.durationSeconds)}
                              </span>
                            )}
                            {log?.recordingUrl && (
                              <a
                                href={log.recordingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 text-xs font-semibold text-primary hover:underline"
                              >
                                Recording
                              </a>
                            )}
                            {a.notes && <span className="ml-2 text-muted">{a.notes}</span>}
                          </div>
                          <span className="shrink-0 text-sm text-soft">{formatDateTime(a.createdAt)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Concern recorder */}
              {lead.originalProject && (
                <div>
                  <h3 className="text-sm font-bold text-navy">Record a concern</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {CONCERN_OPTIONS.map((c) => (
                      <button
                        key={c.v}
                        type="button"
                        disabled={busy}
                        onClick={() => handleRecordConcern(c.v)}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                          lead.concern === c.v
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border bg-white text-muted hover:bg-primary/5"
                        }`}
                      >
                        {c.l}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Property matches */}
              {(matches.length > 0 || requiredFieldsFilled) && (
                <div id="matching-properties">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-navy">Recommended Properties</h3>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => refreshMatches()}
                      className="text-sm font-semibold text-primary hover:underline disabled:opacity-50"
                    >
                      Refresh
                    </button>
                  </div>
                  {matches.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">
                      Complete the requirement (budget, location, BHK) in Edit Details to see matches.
                    </p>
                  ) : (
                    <div className="mt-2.5 space-y-2.5">
                      {matches.map((m) => (
                        <div key={m.projectSlug} className="rounded-xl border border-border bg-white p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-navy">{m.title}</div>
                              <div className="text-sm text-muted">
                                {m.location}
                                {m.bhkOptions.length > 0 ? ` · ${m.bhkOptions.map(bhkLabel).join(", ")}` : ""}
                              </div>
                            </div>
                            <Badge color={matchLevelMeta(m.level).cls}>
                              {matchLevelMeta(m.level).label}
                            </Badge>
                          </div>
                          <div className="mt-1 text-sm text-soft">
                            {m.priceRange} · Possession {m.possessionDate}
                          </div>
                          {m.priceValidUntil &&
                            (() => {
                              const pv = priceValidityInfo({ priceValidUntil: m.priceValidUntil });
                              return pv ? (
                                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-sm font-bold text-amber-700">
                                  Price valid till {pv.validUntil} · {pv.daysLeft} day{pv.daysLeft === 1 ? "" : "s"} left
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
                                <span key={i} className={`rounded-full px-2 py-0.5 text-sm font-semibold ${cls}`}>
                                  {mark} {r.label}
                                </span>
                              );
                            })}
                          </div>
                          <a
                            href={`/projects/${m.projectSlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-block text-sm font-semibold text-primary hover:underline"
                          >
                            View project →
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!isCaller && hasProgressed && (
                <a
                  href={`/crm/leads/${lead.id}/negotiation`}
                  className="inline-block text-sm font-semibold text-primary hover:underline"
                >
                  Open negotiation workspace →
                </a>
              )}

              {/* Activity timeline */}
              <div>
                <h3 className="text-sm font-bold text-navy">Activity</h3>
                {activities.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No activity yet.</p>
                ) : (
                  <div className="mt-2.5 space-y-3">
                    {activities.slice(0, 15).map((a) => (
                      <div key={a.id} className="flex gap-3">
                        <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary/40" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-semibold text-navy">
                              {ACTIVITY_LABELS[a.type] || a.type}
                            </span>
                            <span className="text-soft">
                              {a.userName} · {formatDateTime(a.createdAt)}
                            </span>
                          </div>
                          {a.notes && <div className="mt-0.5 text-sm text-muted">{a.notes}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "visits" && (
            <div role="tabpanel" id="lead-tabpanel-visits" aria-labelledby="lead-tab-visits" className="mt-4 space-y-4">
              {shouldSuggestSecondVisit && (
                <div className="rounded-xl border border-border bg-white p-4">
                  <h3 className="text-sm font-bold text-navy">Suggest a 2nd visit with family?</h3>
                  <p className="mt-1 text-sm text-muted">
                    Customer showed strong interest after the site visit (
                    {latestFeedback?.interest ? `interest: ${String(latestFeedback.interest).toUpperCase()}` : ""}
                    {latestFeedback?.likedProperty ? (latestFeedback.interest ? " · " : "") + `liked: ${String(latestFeedback.likedProperty).toUpperCase()}` : ""}
                    ).
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={`https://wa.me/${waNumber}?text=${encodeURIComponent(SECOND_VISIT_MESSAGE)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        postActivity({
                          type: "message_whatsapp_opened",
                          notes: "2nd visit suggestion message opened on WhatsApp",
                        }).catch(() => {})
                      }
                      className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
                    >
                      <WhatsAppIcon />
                      Send on WhatsApp
                    </a>
                    <button
                      type="button"
                      onClick={openVisitWithFamily}
                      disabled={busy}
                      className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-primary/5 disabled:opacity-50"
                    >
                      Book 2nd Visit
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={openVisit}
                className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-primary/5"
              >
                Schedule Site Visit
              </button>

              {visits.length === 0 ? (
                <p className="text-sm text-muted">No site visits yet.</p>
              ) : (
                visits.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3"
                  >
                    <div className="text-sm">
                      <div className="font-semibold text-navy">
                        {v.projectId || "Project"} · {v.date || "TBD"} {v.time}
                      </div>
                      {v.smName && <div className="text-muted">SM: {v.smName}</div>}
                      {(() => {
                        const tags = parseShown(v.propertiesShown);
                        const summary = tags.length > 0 ? shownSummary(tags) : v.propertyShown;
                        return summary ? (
                          <div className="mt-0.5 font-medium text-emerald-700">Shown: {summary}</div>
                        ) : null;
                      })()}
                    </div>
                    <Badge color={visitStatusMeta(String(v.status)).cls}>
                      {visitStatusMeta(String(v.status)).label}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "messages" && (
            <div role="tabpanel" id="lead-tabpanel-messages" aria-labelledby="lead-tab-messages" className="mt-4 space-y-4">
              {/* Lead tag: a WhatsApp-shareable summary of this lead. */}
              <div className="rounded-xl border border-border bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-navy">Lead Tag</h3>
                  {!tagShown && (
                    <button
                      type="button"
                      onClick={handleGenerateTag}
                      disabled={busy}
                      className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-secondary disabled:opacity-50"
                    >
                      Generate
                    </button>
                  )}
                </div>
                {tagShown ? (
                  <div className="mt-2.5">
                    <pre className="whitespace-pre-wrap rounded-lg bg-navy p-3 text-sm leading-relaxed text-white">
                      {tagText}
                    </pre>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" onClick={handleCopyTag} disabled={busy}>
                        Copy
                      </Button>
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(tagText)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleShareTag}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-1.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
                      >
                        Share on WhatsApp
                      </a>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1.5 text-sm text-muted">
                    A short summary of the client and visit details to share on WhatsApp.
                  </p>
                )}
              </div>

              <div id="message-center">
                {messageCenter ?? (
                  <div className="rounded-xl border border-border bg-white p-4 text-sm text-muted">
                    No message templates configured yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== Mobile: the three actions stay pinned to the bottom ===== */}
      <div className="fixed inset-x-0 bottom-[3.75rem] z-30 border-t border-border bg-white/95 p-2 backdrop-blur lg:hidden">
        {mobileActions}
      </div>

      {/* ===== Call result popup ===== */}
      {showCallResult && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-navy/40 sm:items-center sm:p-4">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-5">
            <h3 className="text-sm font-bold text-navy">Log this call</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {CALL_OUTCOMES.map((o) => (
                <button
                  key={o.type}
                  type="button"
                  onClick={() => setCallOutcome(o.type)}
                  aria-pressed={callOutcome === o.type}
                  className={`${callOutcomeButton} ${
                    callOutcome === o.type
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-white text-navy hover:bg-primary/5"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowMoreOutcomes((s) => !s)}
              className="mt-2 text-sm font-semibold text-primary hover:underline"
            >
              {showMoreOutcomes ? "Fewer outcomes" : "More outcomes"}
            </button>
            {showMoreOutcomes && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CALL_OUTCOMES_EXTRA.map((o) => (
                  <button
                    key={o.type}
                    type="button"
                    onClick={() => setCallOutcome(o.type)}
                    className={`rounded-full px-2.5 py-1 text-sm font-semibold transition-colors ${
                      callOutcome === o.type
                        ? "bg-primary text-white"
                        : "border border-border bg-white text-muted hover:bg-primary/5"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            <textarea
              value={callNote}
              onChange={(e) => setCallNote(e.target.value)}
              placeholder="What was discussed? (optional)"
              rows={2}
              className="mt-3 w-full resize-none rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-primary"
            />
            <div className="mt-2.5">
              <label className="mb-1 block text-sm font-semibold text-muted">Next follow-up date</label>
              <input
                type="date"
                value={callNextDate}
                onChange={(e) => setCallNextDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-primary"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={handleSaveCallResult} disabled={busy || !callOutcome}>
                {busy ? "Saving..." : "Save"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCallResult(false);
                  setCallOutcome("");
                  setCallNote("");
                  setCallNextDate("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Site visit popup (book / manage / mandatory tagging) ===== */}
      {showVisit && (
        <SiteVisitModal
          key={latestVisit ? `visit-${latestVisit.id}` : "new-visit"}
          visit={latestVisit as VisitRecord | null}
          recommendations={recommendedProperties}
          propertyOptions={data.propertyOptions}
          defaults={visitDefaults}
          initialView={visitStartView ?? undefined}
          busy={busy}
          onClose={() => setShowVisit(false)}
          onBook={handleBookVisit}
          onStatus={handleVisitStatus}
          onDone={handleVisitDone}
        />
      )}

      {/* ===== Lost reason picker ===== */}
      {showLostPicker && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-navy/40 sm:items-center sm:p-4">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-5">
            <h3 className="text-sm font-bold text-navy">Mark Lead as Lost</h3>
            <p className="mt-0.5 text-sm text-muted">Select a reason (required).</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {LEAD_LOST_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setLostReason(r.value)}
                  aria-pressed={lostReason === r.value}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                    lostReason === r.value
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-border bg-white text-muted hover:border-red-300"
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
              className="mt-3 w-full resize-none rounded-xl border border-border bg-white px-3 py-2 text-sm text-navy outline-none focus:border-red-400"
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

      {/* ===== Edit details (contact + requirement in one popup) ===== */}
      {showEdit && (
        <EditDetailsModal
          lead={lead}
          busy={busy}
          budgetPresets={budgetPresets}
          onSave={handleSaveEdit}
          onCancel={() => setShowEdit(false)}
        />
      )}

      {/* ===== Delete lead modal ===== */}
      {showDelete && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-navy/40 sm:items-center sm:p-4">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-5">
            <h3 className="text-sm font-bold text-navy">Delete this lead?</h3>
            <p className="mt-1 text-sm text-muted">
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
}

function WorkloadTiles({ w }: { w: any }) {
  if (!w) {
    return <p className="mt-2 text-sm text-muted">Loading workload...</p>;
  }
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {[
        ["Active Leads", w.activeLeads],
        ["Today's Follow-ups", w.todaysFollowUps],
        ["Visits Upcoming", w.upcomingVisits],
        ["Overdue", w.overdueFollowUps],
      ].map(([label, val]) => (
        <div key={label as string} className="rounded-lg bg-gray-50 px-3 py-2">
          <div className="text-sm font-bold text-navy">{val}</div>
          <div className="text-sm text-soft">{label}</div>
        </div>
      ))}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-sm font-semibold text-navy">{value}</dd>
    </div>
  );
}

// One button style for all three lead actions, so height, radius, padding and
// text treatment cannot drift apart between the left card and the mobile bar.
// `whitespace-nowrap` with `min-w-0` keeps "Site Visit" on one line, and the
// grid columns stay equal regardless: the label never sets the width.
// Horizontal padding and the icon gap are deliberately tight. "Site Visit" at
// 14px needs about 103px per column, and the narrowest three-column case is
// 360px (109px), so this leaves real slack instead of a few pixels.
const ACTION_BTN =
  "flex h-12 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-1.5 text-sm font-bold transition-colors disabled:opacity-50";
const ACTION_ICON = "h-[18px] w-[18px] shrink-0";

/**
 * Call / WhatsApp / Site Visit. `layout` picks the container so each placement
 * gets the right column count: the fixed 320px card stacks, the full width
 * mobile bar goes across once there is room.
 */
function LeadActions({
  layout,
  phone,
  waNumber,
  onCall,
  onVisit,
  busy,
  contactsHidden = false,
}: {
  layout: "card" | "bar";
  phone: string;
  waNumber: string;
  onCall: () => void;
  onVisit: () => void;
  busy: boolean;
  /** Set by the API when contact details are masked outside office hours. */
  contactsHidden?: boolean;
}) {
  const container =
    layout === "card"
      ? "grid grid-cols-1 gap-2"
      : "grid grid-cols-1 gap-2 min-[360px]:grid-cols-3";

  // While masked there is no real number to dial, so the tap-to-dial targets are
  // replaced by a disabled control rather than silently dialling "98XX...".
  const hiddenBtn = `${ACTION_BTN} cursor-not-allowed border border-dashed border-amber-300 bg-amber-50 text-amber-800 opacity-90`;

  return (
    <div className={container}>
      {contactsHidden ? (
        <button type="button" disabled title="Available during office hours" className={hiddenBtn}>
          <PhoneIcon className={ACTION_ICON} />
          Call
        </button>
      ) : (
        <a
          href={`tel:+${phone}`}
          onClick={onCall}
          className={`${ACTION_BTN} bg-primary text-white shadow-sm shadow-primary/20 hover:bg-secondary`}
        >
          <PhoneIcon className={ACTION_ICON} />
          Call
        </a>
      )}
      {contactsHidden ? (
        <button type="button" disabled title="Available during office hours" className={hiddenBtn}>
          <WhatsAppIcon className={ACTION_ICON} />
          WhatsApp
        </button>
      ) : (
        <a
          href={`https://wa.me/${waNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${ACTION_BTN} bg-[#25D366] text-white shadow-sm shadow-[#25D366]/30 hover:bg-[#1DA851]`}
        >
          <WhatsAppIcon className={ACTION_ICON} />
          WhatsApp
        </a>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={onVisit}
        className={`${ACTION_BTN} border border-border bg-white text-navy hover:bg-primary/5`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={ACTION_ICON}
        >
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        Site Visit
      </button>
    </div>
  );
}

const LEAD_SOURCES = [
  { value: "meta", label: "Meta" },
  { value: "facebook", label: "Facebook" },
  { value: "google", label: "Google" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "website", label: "Website" },
  { value: "walk_in", label: "Walk-in" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" },
];

/**
 * One popup for every field the detail page does not show inline. Merges the
 * former contact editor and requirement editor; the PATCH route already
 * whitelists all of these columns, so nothing new is written.
 */
function EditDetailsModal({
  lead,
  busy,
  budgetPresets,
  onSave,
  onCancel,
}: {
  lead: Record<string, any>;
  busy: boolean;
  budgetPresets: BudgetPreset[];
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
    location: lead.location || "vasai_west",
    sublocation: lead.sublocation || "",
    bhk: String(lead.bhk || "2").replace(/\s*BHK\s*$/i, ""),
    budgetMin: lead.budgetMin != null ? String(lead.budgetMin) : "",
    budgetMax: lead.budgetMax != null ? String(lead.budgetMax) : "",
    purpose: lead.purpose || "self_use",
    timeline: lead.timeline || "1_3_months",
    loanRequired: lead.loanRequired === true ? "yes" : lead.loanRequired === false ? "no" : "",
    preferredProject: lead.preferredProject || "",
    familyRequirements: lead.familyRequirements || "",
    otherPreferences: lead.otherPreferences || "",
    notes: lead.notes || "",
  });

  const input =
    "w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-primary";
  const label = "mb-1 block text-sm font-semibold text-muted";
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

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
      location: form.location || null,
      sublocation: form.sublocation || null,
      bhk: form.bhk || null,
      // A min/max pair supersedes the legacy free-text budget column.
      budget: null,
      budgetMin: form.budgetMin ? Number(form.budgetMin) : null,
      budgetMax: form.budgetMax ? Number(form.budgetMax) : null,
      purpose: form.purpose || null,
      timeline: form.timeline || null,
      loanRequired:
        form.loanRequired === "yes" ? true : form.loanRequired === "no" ? false : null,
      preferredProject: form.preferredProject.trim() || null,
      familyRequirements: form.familyRequirements.trim() || null,
      otherPreferences: form.otherPreferences.trim() || null,
      notes: form.notes.trim() || null,
    });
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-navy/40 sm:items-center sm:p-4">
      <form
        onSubmit={submit}
        className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5"
      >
        <h3 className="text-sm font-bold text-navy">Edit Details</h3>
        <p className="mt-0.5 text-sm text-muted">Contact, requirement and campaign details.</p>

        <div className="mt-4 space-y-4">
          <div>
            <label className={label}>Name</label>
            <input value={form.name} onChange={(e) => set({ name: e.target.value })} className={input} required />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Phone</label>
              <input value={form.phone} onChange={(e) => set({ phone: e.target.value })} className={input} required />
            </div>
            <div>
              <label className={label}>WhatsApp Number</label>
              <input
                value={form.whatsappNumber}
                onChange={(e) => set({ whatsappNumber: e.target.value })}
                className={input}
              />
            </div>
          </div>

          <div>
            <label className={label}>Email</label>
            <input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} className={input} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Source</label>
              <select value={form.source} onChange={(e) => set({ source: e.target.value })} className={input}>
                {LEAD_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Campaign</label>
              <input
                value={form.campaignName}
                onChange={(e) => set({ campaignName: e.target.value })}
                className={input}
                placeholder="e.g. WhatsApp - Vasai Towers"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Ad Set</label>
              <input value={form.adSetName} onChange={(e) => set({ adSetName: e.target.value })} className={input} />
            </div>
            <div>
              <label className={label}>Ad Name</label>
              <input value={form.adName} onChange={(e) => set({ adName: e.target.value })} className={input} />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={label}>Location</label>
                <select value={form.location} onChange={(e) => set({ location: e.target.value })} className={input}>
                  {Object.entries(LOCATION_LABELS).map(([value, text]) => (
                    <option key={value} value={value}>{text}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Sub-location</label>
                <select value={form.sublocation} onChange={(e) => set({ sublocation: e.target.value })} className={input}>
                  <option value="">None</option>
                  {SUB_LOCATIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>BHK</label>
                <select value={form.bhk} onChange={(e) => set({ bhk: e.target.value })} className={input}>
                  <option value="1">1 BHK</option>
                  <option value="2">2 BHK</option>
                  <option value="3">3 BHK</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className={label}>Budget Range</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {budgetPresets.map((p) => {
                const active =
                  String(p.min ?? "") === form.budgetMin && String(p.max ?? "") === form.budgetMax;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() =>
                      set({
                        budgetMin: p.min == null ? "" : String(p.min),
                        budgetMax: p.max == null ? "" : String(p.max),
                      })
                    }
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
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
                <label className={label}>Budget Min (L)</label>
                <input
                  type="number"
                  min={0}
                  value={form.budgetMin}
                  onChange={(e) => set({ budgetMin: e.target.value })}
                  className={input}
                />
              </div>
              <div>
                <label className={label}>Budget Max (L)</label>
                <input
                  type="number"
                  min={0}
                  value={form.budgetMax}
                  onChange={(e) => set({ budgetMax: e.target.value })}
                  className={input}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={label}>Purpose</label>
              <select value={form.purpose} onChange={(e) => set({ purpose: e.target.value })} className={input}>
                <option value="self_use">Self-use</option>
                <option value="investment">Investment</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div>
              <label className={label}>Timeline</label>
              <select value={form.timeline} onChange={(e) => set({ timeline: e.target.value })} className={input}>
                <option value="immediate">Immediate</option>
                <option value="1_3_months">1–3 months</option>
                <option value="3_6_months">3–6 months</option>
                <option value="6_plus_months">6+ months</option>
                <option value="exploring">Exploring</option>
              </select>
            </div>
            <div>
              <label className={label}>Loan Required</label>
              <select
                value={form.loanRequired}
                onChange={(e) => set({ loanRequired: e.target.value })}
                className={input}
              >
                <option value="">Select</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div>
            <label className={label}>Preferred Project</label>
            <input
              value={form.preferredProject}
              onChange={(e) => set({ preferredProject: e.target.value })}
              className={input}
              placeholder="e.g. Pearl Gardens"
            />
          </div>

          <div>
            <label className={label}>Family Requirements</label>
            <input
              value={form.familyRequirements}
              onChange={(e) => set({ familyRequirements: e.target.value })}
              className={input}
              placeholder="e.g. 3 members, parents included"
            />
          </div>

          <div>
            <label className={label}>Other Preferences</label>
            <input
              value={form.otherPreferences}
              onChange={(e) => set({ otherPreferences: e.target.value })}
              className={input}
              placeholder="Floor, facing, amenities..."
            />
          </div>

          <div>
            <label className={label}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              rows={2}
              className={`${input} resize-none`}
            />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Button type="submit" disabled={busy}>
            Save
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
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

function budgetLabel(lead: Record<string, any>): string {
  if (lead.budget) return String(lead.budget);
  const min = lead.budgetMin;
  const max = lead.budgetMax;
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

function visitStatusMeta(status: string): { label: string; cls: string } {
  switch (status) {
    case "proposed":
      return { label: "Proposed", cls: "bg-cyan-100 text-cyan-800" };
    case "booked":
      return { label: "Booked", cls: "bg-teal-100 text-teal-800" };
    case "confirmed":
      return { label: "Confirmed", cls: "bg-teal-100 text-teal-800" };
    case "arrived":
      return { label: "Arrived", cls: "bg-sky-100 text-sky-800" };
    case "visit_done":
      return { label: "Visit Done", cls: "bg-green-100 text-green-800" };
    case "no_show":
      return { label: "No Show", cls: "bg-red-100 text-red-700" };
    case "cancelled":
      return { label: "Cancelled", cls: "bg-slate-100 text-slate-600" };
    default:
      return { label: status || "—", cls: "bg-gray-100 text-gray-700" };
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
