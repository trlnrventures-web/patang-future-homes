"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useCallback, useEffect } from "react";
import { Badge, Button, PhoneIcon, WhatsAppIcon } from "./ui";
import { ACTIVITY_LABELS, LEAD_STATUS_COLORS, LEAD_STATUS_LABELS } from "@/lib/crm/leads";
import {
  NEGOTIATION_STATUSES,
  NEGOTIATION_STATUS_LABELS,
  NEGOTIATION_STATUS_COLORS,
  OBJECTION_CATEGORIES,
  NEGOTIATION_LOST_REASONS,
  NEXT_ACTION_OPTIONS,
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_COLORS,
  toRupees,
} from "@/lib/crm/sales";

export type NegotiationData = {
  lead: Record<string, any>;
  negotiation: Record<string, any> | null;
  activities: any[];
  visits: any[];
  bookings: any[];
  projectMap: Record<string, string>;
};

type Props = {
  data: NegotiationData;
  currentUser: { id: number; role: string };
};

export default function NegotiationWorkspace({ data, currentUser }: Props) {
  const [lead, setLead] = useState(data.lead);
  const [negotiation, setNegotiation] = useState(data.negotiation);
  const [activities, setActivities] = useState(data.activities);
  const [visits, setVisits] = useState(data.visits);
  const [bookings, setBookings] = useState(data.bookings);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  // Modals / panels
  const [showBooking, setShowBooking] = useState(false);
  const [showVisit, setShowVisit] = useState(false);
  const [showLost, setShowLost] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const [showStart, setShowStart] = useState(false);

  const [newObjection, setNewObjection] = useState("");
  const [newCompeting, setNewCompeting] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [lostAction, setLostAction] = useState("Follow up");
  const [lostActionAt, setLostActionAt] = useState("");
  const [matches, setMatches] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState(negotiation?.status || "");

  // Booking form
  const [bookProject, setBookProject] = useState("");
  const [bookUnit, setBookUnit] = useState("");
  const [bookBhk, setBookBhk] = useState(lead.bhk || "");
  const [bookDate, setBookDate] = useState(new Date().toISOString().slice(0, 10));
  const [bookAmount, setBookAmount] = useState("");
  const [bookTotal, setBookTotal] = useState("");
  const [bookFloor, setBookFloor] = useState("");
  const [bookCarpet, setBookCarpet] = useState("");
  const [bookNotes, setBookNotes] = useState("");

  // Visit form
  const [visitProject, setVisitProject] = useState(negotiation?.projectId || "");
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");
  const [visitPoint, setVisitPoint] = useState("");
  const [visitNote, setVisitNote] = useState("");

  // Negotiation form
  const [negFields, setNegFields] = useState({
    expectedPrice: negotiation?.expectedPrice ?? "",
    quotedPrice: negotiation?.quotedPrice ?? "",
    finalDiscussedPrice: negotiation?.finalDiscussedPrice ?? "",
    bookingAmountDiscussed: negotiation?.bookingAmountDiscussed ?? "",
    unitPreference: negotiation?.unitPreference ?? "",
    floorPreference: negotiation?.floorPreference ?? "",
    facingPreference: negotiation?.facingPreference ?? "",
    paymentPreference: negotiation?.paymentPreference ?? "",
    loanRequirement: negotiation?.loanRequirement ?? "",
    notes: negotiation?.notes ?? "",
    nextAction: negotiation?.nextAction ?? "",
    nextActionAt: negotiation?.nextActionAt ?? "",
  });

  const setNeg = (patch: Partial<typeof negFields>) => setNegFields((p) => ({ ...p, ...patch }));

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  }, []);

  const phone = (lead.whatsappNumber || lead.phone || "").replace(/\D/g, "");
  const waNumber = phone.length === 10 ? `91${phone}` : phone;

  const latestVisit = visits.filter((v) => v.status === "visit_done" || v.status === "confirmed").slice(-1)[0];
  const [leadAge, setLeadAge] = useState("");
  useEffect(() => {
    const tick = () => {
      const d = Date.now() - new Date(lead.createdAt).getTime();
      const mins = Math.floor(d / 60000);
      if (mins < 60) setLeadAge(`${mins}m`);
      else {
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) setLeadAge(`${hrs}h`);
        else setLeadAge(`${Math.floor(hrs / 24)}d`);
      }
    };
    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, [lead.createdAt]);

  // ====== API helpers ======
  const api = useCallback(
    async (url: string, method: string, body?: any) => {
      const opts: RequestInit = {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
      };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(url, opts);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      return data;
    },
    []
  );

  const refreshLead = useCallback(async () => {
    try {
      const d = await api(`/crm/api/leads/${lead.id}`, "GET");
      if (d.lead) setLead(d.lead);
    } catch { /* ignore */ }
  }, [lead.id, api]);

  const postActivity = useCallback(
    async (body: any) => {
      const res = await fetch(`/crm/api/leads/${lead.id}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("failed");
    },
    [lead.id]
  );

  // ====== Actions ======
  const handleStartNegotiation = useCallback(async () => {
    setBusy(true);
    try {
      const d = await api(`/crm/api/leads/${lead.id}/negotiation`, "POST", {
        action: "start",
        notes: "Moved to negotiation",
      });
      setNegotiation(d.negotiation);
      setNegFields({
        expectedPrice: d.negotiation?.expectedPrice ?? "",
        quotedPrice: d.negotiation?.quotedPrice ?? "",
        finalDiscussedPrice: d.negotiation?.finalDiscussedPrice ?? "",
        bookingAmountDiscussed: d.negotiation?.bookingAmountDiscussed ?? "",
        unitPreference: d.negotiation?.unitPreference ?? "",
        floorPreference: d.negotiation?.floorPreference ?? "",
        facingPreference: d.negotiation?.facingPreference ?? "",
        paymentPreference: d.negotiation?.paymentPreference ?? "",
        loanRequirement: d.negotiation?.loanRequirement ?? "",
        notes: d.negotiation?.notes ?? "",
        nextAction: d.negotiation?.nextAction ?? "",
        nextActionAt: d.negotiation?.nextActionAt ?? "",
      });
      showToast("Moved to negotiation");
      refreshLead();
      setShowStart(false);
    } catch (e: any) {
      showToast(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }, [lead.id, api, showToast, refreshLead]);

  const handleMarkLost = useCallback(async () => {
    if (!lostReason) {
      showToast("Reason required");
      return;
    }
    setBusy(true);
    try {
      await api(`/crm/api/leads/${lead.id}/negotiation`, "POST", {
        action: "lost",
        reason: lostReason,
        nextAction: lostAction,
        nextActionAt: lostActionAt,
      });
      setNegotiation((n) => n ? { ...n, status: "negotiation_lost", lostReason, nextAction: lostAction, nextActionAt: lostActionAt } : n);
      setStatusFilter("");
      setShowLost(false);
      refreshLead();
      showToast("Negotiation lost");
    } catch (e: any) {
      showToast(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }, [lead.id, lostReason, lostAction, lostActionAt, api, showToast, refreshLead]);

  const handleNegotiationUpdate = useCallback(async () => {
    if (!negotiation) return;
    setBusy(true);
    try {
      const payload: any = {};
      for (const [k, v] of Object.entries(negFields)) {
        if (v === "" || v === null || v === undefined) payload[k] = null;
        else if (["expectedPrice", "quotedPrice", "finalDiscussedPrice", "bookingAmountDiscussed"].includes(k)) {
          payload[k] = Number(v);
        } else payload[k] = v;
      }
      if (statusFilter && statusFilter !== negotiation.status) {
        payload.status = statusFilter;
      }
      const d = await api(`/crm/api/leads/${lead.id}/negotiation`, "PATCH", payload);
      setNegotiation(d.negotiation);
      setNegFields({
        expectedPrice: d.negotiation?.expectedPrice ?? "",
        quotedPrice: d.negotiation?.quotedPrice ?? "",
        finalDiscussedPrice: d.negotiation?.finalDiscussedPrice ?? "",
        bookingAmountDiscussed: d.negotiation?.bookingAmountDiscussed ?? "",
        unitPreference: d.negotiation?.unitPreference ?? "",
        floorPreference: d.negotiation?.floorPreference ?? "",
        facingPreference: d.negotiation?.facingPreference ?? "",
        paymentPreference: d.negotiation?.paymentPreference ?? "",
        loanRequirement: d.negotiation?.loanRequirement ?? "",
        notes: d.negotiation?.notes ?? "",
        nextAction: d.negotiation?.nextAction ?? "",
        nextActionAt: d.negotiation?.nextActionAt ?? "",
      });
      showToast("Negotiation updated");
    } catch (e: any) {
      showToast(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }, [negotiation, negFields, statusFilter, lead.id, api, showToast]);

  const handleAddObjection = useCallback(async () => {
    if (!newObjection) return;
    setBusy(true);
    try {
      const d = await api(`/crm/api/leads/${lead.id}/negotiation`, "POST", {
        action: "objection",
        value: newObjection,
      });
      setNegotiation((n) => n ? { ...n, objections: d.objections } : n);
      setNewObjection("");
      showToast("Objection recorded");
    } catch (e: any) {
      showToast(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }, [lead.id, newObjection, api, showToast]);

  const handleAddCompeting = useCallback(async () => {
    if (!newCompeting) return;
    setBusy(true);
    try {
      const d = await api(`/crm/api/leads/${lead.id}/negotiation`, "POST", {
        action: "competing",
        value: newCompeting,
      });
      setNegotiation((n) => n ? { ...n, competingProjects: d.competingProjects } : n);
      setNewCompeting("");
      showToast("Project added");
    } catch (e: any) {
      showToast(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }, [lead.id, newCompeting, api, showToast]);

  const handleSelectAlternative = useCallback(async (slug: string) => {
    setBusy(true);
    try {
      await api(`/crm/api/leads/${lead.id}/negotiation`, "POST", {
        action: "alternative",
        value: slug,
      });
      setNegotiation((n) => n ? { ...n, projectId: slug } : n);
      showToast("Alternative selected");
      setShowMatches(false);
    } catch (e: any) {
      showToast(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }, [lead.id, api, showToast]);

  const handleCreateBooking = useCallback(async () => {
    setBusy(true);
    try {
      const payload: any = {
        projectId: bookProject || negotiation?.projectId,
        unit: bookUnit,
        bhk: bookBhk,
        bookingDate: bookDate,
        bookingAmount: bookAmount ? Number(bookAmount) : undefined,
        totalValue: bookTotal ? Number(bookTotal) : undefined,
        floor: bookFloor || undefined,
        carpetArea: bookCarpet || undefined,
        notes: bookNotes || undefined,
      };
      const d = await api(`/crm/api/leads/${lead.id}/bookings`, "POST", payload);
      setBookings((prev) => [d.booking, ...prev]);
      setShowBooking(false);
      setBookProject("");
      setBookUnit("");
      setBookAmount("");
      setBookTotal("");
      setBookFloor("");
      setBookCarpet("");
      setBookNotes("");
      showToast("Booking initiated");
    } catch (e: any) {
      showToast(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }, [lead.id, bookProject, bookUnit, bookBhk, bookDate, bookAmount, bookTotal, bookFloor, bookCarpet, bookNotes, negotiation, api, showToast]);

  const handleConfirmBooking = useCallback(async (bookingId: number) => {
    setBusy(true);
    try {
      const d = await api(`/crm/api/leads/${lead.id}/bookings/${bookingId}`, "PATCH", {
        status: "confirmed",
      });
      setBookings((prev) => prev.map((b) => b.id === bookingId ? d.booking : b));
      refreshLead();
      showToast("Booking confirmed");
    } catch (e: any) {
      showToast(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }, [lead.id, api, showToast, refreshLead]);

  const handleCancelBooking = useCallback(async (bookingId: number) => {
    const reason = window.prompt("Cancellation reason:");
    if (!reason) return;
    setBusy(true);
    try {
      const d = await api(`/crm/api/leads/${lead.id}/bookings/${bookingId}`, "PATCH", {
        status: "cancelled",
        cancellationReason: reason,
      });
      setBookings((prev) => prev.map((b) => b.id === bookingId ? d.booking : b));
      refreshLead();
      showToast("Booking cancelled");
    } catch (e: any) {
      showToast(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }, [lead.id, api, showToast, refreshLead]);

  const handleScheduleVisit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await postActivity({
        type: "visit_booked",
        visitDate: visitDate,
        visitTime: visitTime,
        meetingPoint: visitPoint,
        projectId: visitProject || negotiation?.projectId,
        smId: lead.assignedSmId || currentUser.id,
        notes: visitNote,
      });
      showToast("Visit scheduled");
      setShowVisit(false);
    } catch {
      showToast("Failed to schedule");
    } finally {
      setBusy(false);
    }
  }, [lead, currentUser, postActivity, showToast, visitDate, visitTime, visitPoint, visitProject, visitNote, negotiation]);

  const handleLoadMatches = useCallback(async () => {
    if (showMatches) { setShowMatches(false); return; }
    setBusy(true);
    try {
      const d = await api(`/crm/api/leads/${lead.id}/matches`, "GET");
      setMatches(d.matches || []);
      setShowMatches(true);
    } catch {
      showToast("Matches load nahi hue");
    } finally {
      setBusy(false);
    }
  }, [lead.id, api, showToast, showMatches]);

  // ========= ========= ========= ========= ========= ========= =========
  const active = negotiation && !["booked", "negotiation_lost"].includes(negotiation.status as never);
  const latestVisitFull = latestVisit;
  const leadStatusColor = LEAD_STATUS_COLORS[lead.status] || "bg-gray-100 text-gray-700";
  const leadStatusLabel = LEAD_STATUS_LABELS[lead.status] || lead.status;

  return (
    <div className="space-y-5">
      {toast && (
        <div className="fixed left-1/2 top-16 z-[100] -translate-x-1/2 rounded-xl bg-navy px-4 py-2.5 text-sm font-medium text-white shadow-2xl">
          {toast}
        </div>
      )}

      {/* ===== Customer Card ===== */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-primary">{lead.name}</h2>
            <p className="mt-0.5 text-sm text-muted">{lead.phone || "No phone"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={leadStatusColor}>{leadStatusLabel}</Badge>
            <Badge color="bg-slate-100 text-slate-700">Age: {leadAge}</Badge>
            {lead.source && (
              <Badge color="bg-primary/5 text-primary">{lead.source}</Badge>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
          {lead.assignedCallerName && <span>Caller: {lead.assignedCallerName}</span>}
          {lead.assignedSmName && <span>SM: {lead.assignedSmName}</span>}
          <span>Original: {lead.originalProject || "—"}</span>
        </div>
      </div>

      {/* ===== Quick Actions ===== */}
      <div className="flex flex-wrap gap-2">
        <a
          href={`tel:+${phone}`}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white"
        >
          <PhoneIcon /> CALL
        </a>
        <a
          href={`https://wa.me/${waNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-2 text-xs font-bold text-white"
        >
          <WhatsAppIcon /> WHATSAPP
        </a>
        <a
          href={`/crm/leads/${lead.id}#message-center`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-bold text-primary"
        >
          MESSAGE CUSTOMER
        </a>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowVisit((s) => !s)}
          className="text-xs"
        >
          + SCHEDULE VISIT
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowBooking((s) => !s)}
          className="text-xs"
        >
          + CREATE BOOKING
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleLoadMatches}
          className="text-xs"
        >
          {showMatches ? "HIDE ALTERNATIVES" : "FIND ALTERNATIVE"}
        </Button>
      </div>

      {/* ===== Visit Schedule Panel ===== */}
      {showVisit && (
        <form onSubmit={handleScheduleVisit} className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
          <h3 className="text-sm font-bold text-primary">Schedule Visit</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              type="date"
              required
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
            />
            <input
              type="time"
              required
              value={visitTime}
              onChange={(e) => setVisitTime(e.target.value)}
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Meeting point"
              value={visitPoint}
              onChange={(e) => setVisitPoint(e.target.value)}
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
            />
          </div>
          <textarea
            placeholder="Visit notes"
            value={visitNote}
            onChange={(e) => setVisitNote(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy} size="sm" variant="success">
              SCHEDULE VISIT
            </Button>
            <Button type="button" onClick={() => setShowVisit(false)} size="sm" variant="ghost">
              CANCEL
            </Button>
          </div>
        </form>
      )}

      {/* ===== Booking Panel ===== */}
      {showBooking && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
          <h3 className="text-sm font-bold text-primary">Create Booking</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select
              value={bookProject}
              onChange={(e) => setBookProject(e.target.value)}
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
            >
              <option value="">Project</option>
              {Object.entries(data.projectMap).map(([slug, title]) => (
                <option key={slug} value={slug}>{title}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Unit (e.g. A-1204)"
              value={bookUnit}
              onChange={(e) => setBookUnit(e.target.value)}
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
            />
            <select
              value={bookBhk}
              onChange={(e) => setBookBhk(e.target.value)}
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
            >
              <option value="">BHK</option>
              {["1 BHK", "2 BHK", "3 BHK", "4 BHK", "Villa", "Shop"].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <input
              type="date"
              required
              value={bookDate}
              onChange={(e) => setBookDate(e.target.value)}
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={0}
              placeholder="Booking amount ₹"
              value={bookAmount}
              onChange={(e) => setBookAmount(e.target.value)}
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={0}
              placeholder="Total value ₹"
              value={bookTotal}
              onChange={(e) => setBookTotal(e.target.value)}
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Floor"
              value={bookFloor}
              onChange={(e) => setBookFloor(e.target.value)}
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Carpet area"
              value={bookCarpet}
              onChange={(e) => setBookCarpet(e.target.value)}
              className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
            />
          </div>
          <textarea
            placeholder="Notes"
            value={bookNotes}
            onChange={(e) => setBookNotes(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Button
              onClick={handleCreateBooking}
              disabled={busy || !bookProject || !bookDate}
              size="sm"
              variant="success"
            >
              CREATE BOOKING
            </Button>
            <Button onClick={() => setShowBooking(false)} size="sm" variant="ghost">
              CANCEL
            </Button>
          </div>
        </div>
      )}

      {/* ===== Alternative Property Matches ===== */}
      {showMatches && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <h3 className="text-sm font-bold text-primary">Alternative Properties</h3>
          {matches.length === 0 ? (
            <p className="text-xs text-muted">No suitable matches found.</p>
          ) : (
            <div className="space-y-2">
              {matches.map((m: any, i: number) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-white p-3">
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-primary">{m.title}</span>
                    <span className="ml-2 text-xs text-muted">{m.project}</span>
                    <p className="text-xs text-muted">
                      {m.budget} · {m.bhk} · {m.location}
                    </p>
                    {m.reasons?.length > 0 && (
                      <p className="mt-0.5 text-[11px] text-muted">
                        {m.reasons.slice(0, 3).map((r: string, j: number) => (
                          <span key={j} className="mr-1.5 inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">
                            {r}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => handleSelectAlternative(m.slug)}
                  >
                    SELECT
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== No negotiation started prompt ===== */}
      {!negotiation && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <h3 className="text-sm font-bold text-primary">Start Negotiation</h3>
          <p className="mt-1 text-xs text-muted">Move this lead into the negotiation stage.</p>
          <Button
            className="mt-3"
            size="sm"
            disabled={busy}
            onClick={handleStartNegotiation}
          >
            MOVE TO NEGOTIATION
          </Button>
        </div>
      )}

      {/* ===== Negotiation Status + Details ===== */}
      {negotiation && (
        <>
          {/* Status selector — clean compact style */}
          <div className="rounded-2xl border border-border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-primary">Negotiation Status</h3>
              <Badge color={NEGOTIATION_STATUS_COLORS[negotiation.status] || "bg-gray-100 text-gray-700"}>
                {NEGOTIATION_STATUS_LABELS[negotiation.status] || negotiation.status}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {NEGOTIATION_STATUSES.filter((s) => s.value !== "negotiation_lost").map((s) => (
                <button
                  key={s.value}
                  disabled={busy}
                  onClick={() => setStatusFilter(s.value)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    negotiation.status === s.value || statusFilter === s.value
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-white text-muted hover:bg-primary/5"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Internal Negotiation Details */}
          <div className="rounded-2xl border border-border bg-white p-4">
            <h3 className="text-sm font-bold text-primary">Internal Negotiation Details</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { label: "Expected price", field: "expectedPrice", type: "number", suffix: "₹" },
                { label: "Quoted price", field: "quotedPrice", type: "number", suffix: "₹" },
                { label: "Final discussed", field: "finalDiscussedPrice", type: "number", suffix: "₹" },
                { label: "Booking amount", field: "bookingAmountDiscussed", type: "number", suffix: "₹" },
                { label: "Unit preference", field: "unitPreference", type: "text" },
                { label: "Floor", field: "floorPreference", type: "text" },
                { label: "Facing", field: "facingPreference", type: "text" },
                { label: "Payment", field: "paymentPreference", type: "text" },
                { label: "Loan", field: "loanRequirement", type: "text" },
              ].map((f) => (
                <div key={f.field} className="text-xs">
                  <label className="mb-0.5 block text-muted">{f.label}</label>
                  <input
                    type={f.type}
                    value={String(negFields[f.field as keyof typeof negFields] ?? "")}
                    onChange={(e) => setNeg({ [f.field]: f.type === "number" ? Number(e.target.value) || "" : e.target.value })}
                    placeholder={f.suffix || ""}
                    className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs">
              <label className="mb-0.5 block text-muted">Notes</label>
              <textarea
                value={String(negFields.notes ?? "")}
                onChange={(e) => setNeg({ notes: e.target.value })}
                rows={2}
                className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
                placeholder="Negotiation notes..."
              />
            </div>
          </div>

          {/* Next Action */}
          <div className="rounded-2xl border border-border bg-white p-4">
            <h3 className="text-sm font-bold text-primary">Next Action</h3>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select
                value={String(negFields.nextAction ?? "")}
                onChange={(e) => setNeg({ nextAction: e.target.value })}
                className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
              >
                <option value="">Select action</option>
                {NEXT_ACTION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <input
                type="datetime-local"
                value={String(negFields.nextActionAt ?? "")}
                onChange={(e) => setNeg({ nextActionAt: e.target.value })}
                className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-3">
              <Button size="sm" disabled={busy} onClick={handleNegotiationUpdate}>
                UPDATE NEGOTIATION
              </Button>
              {active && (
                <Button
                  size="sm"
                  variant="danger"
                  className="ml-2"
                  onClick={() => setShowLost(true)}
                >
                  MARK LOST
                </Button>
              )}
            </div>
          </div>

          {/* Objections */}
          <div className="rounded-2xl border border-border bg-white p-4">
            <h3 className="text-sm font-bold text-primary">Objections</h3>
            {negotiation.objections && negotiation.objections.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {negotiation.objections.map((o: string, i: number) => (
                  <span key={i} className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800">
                    {OBJECTION_CATEGORIES.find((c) => c.value === o)?.label || o}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <select
                value={newObjection}
                onChange={(e) => setNewObjection(e.target.value)}
                className="flex-1 rounded-xl border border-border bg-white px-3 py-2 text-sm"
              >
                <option value="">Add objection</option>
                {OBJECTION_CATEGORIES
                  .filter((c) => !negotiation.objections?.includes(c.value))
                  .map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
              </select>
              <Button size="sm" variant="secondary" disabled={busy || !newObjection} onClick={handleAddObjection}>
                ADD
              </Button>
            </div>
          </div>

          {/* Competing Projects */}
          <div className="rounded-2xl border border-border bg-white p-4">
            <h3 className="text-sm font-bold text-primary">Competing Projects</h3>
            {negotiation.competingProjects && negotiation.competingProjects.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {negotiation.competingProjects.map((slug: string, i: number) => (
                  <span key={i} className="rounded-full bg-orange-50 px-3 py-1 text-[11px] font-semibold text-orange-800">
                    {data.projectMap[slug] || slug}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <select
                value={newCompeting}
                onChange={(e) => setNewCompeting(e.target.value)}
                className="flex-1 rounded-xl border border-border bg-white px-3 py-2 text-sm"
              >
                <option value="">Add competing project</option>
                {Object.entries(data.projectMap)
                  .filter(([slug]) => slug !== negotiation.projectId && !negotiation.competingProjects?.includes(slug))
                  .map(([slug, title]) => (
                    <option key={slug} value={slug}>{title}</option>
                  ))}
              </select>
              <Button size="sm" variant="secondary" disabled={busy || !newCompeting} onClick={handleAddCompeting}>
                ADD
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ===== Visit Summary ===== */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <h3 className="text-sm font-bold text-primary">Visit Summary</h3>
        {latestVisitFull ? (
          <div className="mt-2 space-y-1 text-sm">
            <p>
              <span className="text-muted">Date: </span>
              {latestVisitFull.date} {latestVisitFull.time}
            </p>
            <p>
              <span className="text-muted">Status: </span>
              <span className="font-semibold">{latestVisitFull.status?.replace("_", " ")}</span>
            </p>
            <p>
              <span className="text-muted">Project: </span>
              {data.projectMap[latestVisitFull.projectId] || latestVisitFull.projectId || "—"}
            </p>
            {latestVisitFull.feedback && (
              <>
                <p>
                  <span className="text-muted">Interest: </span>
                  <span className="font-semibold uppercase">{latestVisitFull.feedback.interest}</span>
                </p>
                {latestVisitFull.feedback.mainObjection && (
                  <p>
                    <span className="text-muted">Objection: </span>
                    {latestVisitFull.feedback.mainObjection}
                  </p>
                )}
                {latestVisitFull.feedback.notes && (
                  <p className="text-xs text-muted">{latestVisitFull.feedback.notes}</p>
                )}
              </>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">No completed visit yet.</p>
        )}
        {visits.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <h4 className="text-xs font-bold text-muted">All visits ({visits.length})</h4>
            {visits.map((v, i) => (
              <div key={v.id} className="flex items-center gap-2 text-xs text-muted">
                <span className="font-semibold">#{i + 1}</span>
                <span>{data.projectMap[v.projectId] || v.projectId || "Project"}</span>
                <span>{v.date}</span>
                <Badge color={v.status === "visit_done" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-700"}>
                  {v.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== Bookings ===== */}
      {bookings.length > 0 && (
        <div className="rounded-2xl border border-border bg-white p-4 space-y-3">
          <h3 className="text-sm font-bold text-primary">Bookings</h3>
          {bookings.map((b) => (
            <div key={b.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-bold text-primary">{b.projectTitle || b.projectId}</span>
                  {b.unit && <span className="ml-2 text-muted">Unit: {b.unit}</span>}
                  {b.bhk && <span className="ml-2 text-muted">{b.bhk}</span>}
                </div>
                <Badge color={BOOKING_STATUS_COLORS[b.status] || "bg-gray-100 text-gray-700"}>
                  {BOOKING_STATUS_LABELS[b.status] || b.status}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                <span>Date: {new Date(b.bookingDate).toLocaleDateString("en-IN")}</span>
                {b.bookingAmount != null && <span>Booking: {toRupees(b.bookingAmount)}</span>}
                {b.totalValue != null && <span>Value: {toRupees(b.totalValue)}</span>}
                <span>SM: {b.smName}</span>
              </div>
              {b.cancellationReason && (
                <p className="mt-1 text-xs text-red-700">Reason: {b.cancellationReason}</p>
              )}
              <div className="mt-2 flex gap-2">
                {b.status === "initiated" && (
                  <>
                    <Button
                      size="sm"
                      variant="success"
                      disabled={busy}
                      onClick={() => handleConfirmBooking(b.id)}
                    >
                      CONFIRM BOOKING
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      onClick={() => handleCancelBooking(b.id)}
                    >
                      CANCEL
                    </Button>
                  </>
                )}
                {b.status === "confirmed" && (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() => handleCancelBooking(b.id)}
                  >
                    CANCEL BOOKING
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== Lost Modal ===== */}
      {showLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 max-w-sm w-full rounded-2xl bg-white p-5 space-y-4">
            <h3 className="text-sm font-bold text-primary">Mark Negotiation Lost</h3>
            <select
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
            >
              <option value="">Select reason</option>
              {NEGOTIATION_LOST_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={lostAction}
                onChange={(e) => setLostAction(e.target.value)}
                className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
              >
                {NEXT_ACTION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <input
                type="datetime-local"
                value={lostActionAt}
                onChange={(e) => setLostActionAt(e.target.value)}
                className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
              />
            </div>
            <p className="text-[11px] text-muted">The lead remains recoverable in CRM.</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="danger"
                disabled={busy || !lostReason}
                onClick={handleMarkLost}
              >
                CONFIRM LOST
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowLost(false)}>
                CANCEL
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Activity Timeline ===== */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <h3 className="text-sm font-bold text-primary">Activity Timeline</h3>
        <div className="mt-3 space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {activities.length === 0 && (
            <p className="text-xs text-muted">No activities yet.</p>
          )}
          {activities.slice(0, 30).map((a) => {
            const ts = a.createdAt ? new Date(a.createdAt) : null;
            const dateStr = ts
              ? `${ts.getDate()} ${ts.toLocaleString("en-IN", { month: "short" })} · ${ts.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}`
              : "";
            return (
              <div key={a.id} className="flex gap-3 text-xs">
                <div className="min-w-[100px] shrink-0 text-muted">{dateStr}</div>
                <div className="min-w-0">
                  <span className="font-semibold text-primary">
                    {ACTIVITY_LABELS[a.type] || a.type}
                  </span>
                  {a.userName && <span className="ml-1 text-muted">· {a.userName}</span>}
                  {a.notes && <p className="mt-0.5 text-muted break-words">{a.notes}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

