import { getSlaFirstResponseMin, getNoResponseSchedule } from "./settings";
import type { SlaStatus, PriorityLevel } from "./sla";

export function minutesBetween(a: string, b: string): number {
  const t = new Date(b).getTime() - new Date(a).getTime();
  return Math.floor(t / 60000);
}

export function formatSla(slaMinutes: number): string {
  if (slaMinutes < 1) {
    return `${Math.max(1, Math.round(slaMinutes * 60))} sec`;
  }
  return `${slaMinutes} min`;
}

export function computeSlaStatus(createdAt: string, firstCallAt: string | null): SlaStatus {
  const slaMin = getSlaFirstResponseMin();
  if (firstCallAt) {
    const firstCallMin = minutesBetween(createdAt, firstCallAt);
    return firstCallMin <= slaMin ? "within_sla" : "overdue";
  }
  const now = new Date();
  const elapsedMin = (now.getTime() - new Date(createdAt).getTime()) / 60000;
  if (elapsedMin >= slaMin * 1.5) return "overdue";
  if (elapsedMin >= slaMin) return "approaching_sla";
  return "within_sla";
}

export function getPriority(
  lead: {
    status: string;
    createdAt: string;
    firstCallAt: string | null;
    nextFollowUp: string | null;
    nextAttemptAt: string | null;
    attemptCount: number | null;
  }
): PriorityLevel {
  const status = lead.status;

  if (status === "new") {
    const slaMin = getSlaFirstResponseMin();
    const elapsedMin = (new Date().getTime() - new Date(lead.createdAt).getTime()) / 60000;
    if (elapsedMin >= slaMin * 1.5) return "p3_overdue_call";
    if (elapsedMin >= slaMin) return "p2_approaching_sla";
    return "p1_new";
  }
  if (status === "calling" || status === "connected") {
    const next = lead.nextAttemptAt || lead.nextFollowUp;
    if (next && new Date(next).getTime() < new Date().getTime()) return "p3_overdue_call";
    return "p6_follow_up";
  }
  if (status === "no_response") {
    const next = lead.nextAttemptAt;
    if (next && new Date(next).getTime() < new Date().getTime()) return "p4_callback";
    return "p7_no_response";
  }
  if (status === "qualified") return "p5_ready_to_assign";
  if (status === "follow_up" || status === "visit_proposed" || status === "visit_booked" || status === "visit_confirmed" || status === "visit_done" || status === "negotiation") {
    const next = lead.nextFollowUp;
    if (next && new Date(next).getTime() < new Date().getTime()) return "p3_overdue_call";
    if (next) return "p4_callback";
    return "p6_follow_up";
  }
  if (status === "assigned") return "p6_follow_up";
  return "p8_idle";
}

export function nextNoResponseAttempt(attemptCount: number): string | null {
  const schedule = getNoResponseSchedule();
  const mins = schedule[attemptCount];
  if (mins == null) return null;
  return new Date(Date.now() + mins * 60000).toISOString();
}

export const TERMINAL_STATUSES = new Set(["invalid", "lost", "dnc", "booked"]);

/**
 * Single, consistent "overdue" definition shared by the inbox, the leads list,
 * the quick "Overdue" filter and the snapshot tiles:
 * - Terminal statuses are never overdue.
 * - New/calling leads are overdue when their first-call SLA window has passed
 *   (elapsed >= 1.5x the response SLA, matching computeSlaStatus).
 * - Every other status is overdue when its scheduled action time has passed.
 */
export function isLeadActionOverdue(
  lead: {
    status: string;
    createdAt: string;
    firstCallAt: string | null;
    nextActionAt: string | null;
  },
  now = Date.now()
): boolean {
  if (TERMINAL_STATUSES.has(lead.status)) return false;
  if (lead.status === "new" || lead.status === "calling") {
    if (computeSlaStatus(lead.createdAt, lead.firstCallAt) === "overdue") return true;
  }
  return !!lead.nextActionAt && new Date(lead.nextActionAt).getTime() < now;
}