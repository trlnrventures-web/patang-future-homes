export type SlaStatus = "within_sla" | "approaching_sla" | "overdue" | "no_call" | "n/a";

export type PriorityLevel = "p1_new" | "p2_approaching_sla" | "p3_overdue_call" | "p4_callback" | "p5_ready_to_assign" | "p6_follow_up" | "p7_no_response" | "p8_idle";

export function priorityRank(p: PriorityLevel): number {
  const order: PriorityLevel[] = [
    "p1_new", "p2_approaching_sla", "p3_overdue_call", "p4_callback",
    "p5_ready_to_assign", "p6_follow_up", "p7_no_response", "p8_idle",
  ];
  return order.indexOf(p);
}

export function leadAgeMinutes(createdAt: string): number {
  return Math.max(0, (new Date().getTime() - new Date(createdAt).getTime()) / 60000);
}

export function formatLeadAge(createdAt: string): string {
  const mins = leadAgeMinutes(createdAt);
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.floor(mins)}m ago`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.floor(hrs)}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function slaStatusMeta(s: SlaStatus) {
  switch (s) {
    case "within_sla":
      return { label: "Within SLA", cls: "bg-emerald-100 text-emerald-800" };
    case "approaching_sla":
      return { label: "Approaching SLA", cls: "bg-amber-100 text-amber-800" };
    case "overdue":
      return { label: "SLA Overdue", cls: "bg-red-100 text-red-700" };
    case "no_call":
      return { label: "Not called", cls: "bg-slate-100 text-slate-600" };
    default:
      return { label: "No SLA", cls: "bg-slate-100 text-slate-500" };
  }
}

/**
 * Left-border accent color used on lead cards. One consistent 4-color system:
 * red = Overdue, amber = Hot/SLA Breach, gray = Routine, green = Resolved/Booked.
 */
export function leadAccentCls(lead: {
  status?: string;
  slaStatus?: SlaStatus | string | null;
  hasOverdueFollowUp?: boolean;
}): string {
  if (lead.status === "booked") return "bg-emerald-500";
  if (lead.hasOverdueFollowUp || lead.slaStatus === "overdue") return "bg-red-500";
  if (lead.slaStatus === "approaching_sla") return "bg-amber-500";
  return "bg-gray-300";
}