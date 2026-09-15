import type { AuthUser } from "./auth";

export const NEGOTIATION_STATUSES = [
  { value: "negotiation_started", label: "Negotiation started" },
  { value: "price_discussion", label: "Price discussion" },
  { value: "unit_discussion", label: "Unit discussion" },
  { value: "family_decision", label: "Family decision" },
  { value: "loan_process", label: "Loan process" },
  { value: "ready_to_book", label: "Ready to book" },
  { value: "on_hold", label: "On hold" },
  { value: "negotiation_lost", label: "Negotiation lost" },
] as const;

export const NEGOTIATION_STATUS_LABELS: Record<string, string> =
  Object.fromEntries(NEGOTIATION_STATUSES.map((s) => [s.value, s.label]));

export const NEGOTIATION_STATUS_COLORS: Record<string, string> = {
  negotiation_started: "bg-slate-100 text-slate-700",
  price_discussion: "bg-amber-100 text-amber-800",
  unit_discussion: "bg-cyan-100 text-cyan-800",
  family_decision: "bg-orange-100 text-orange-800",
  loan_process: "bg-blue-100 text-blue-800",
  ready_to_book: "bg-emerald-100 text-emerald-800",
  on_hold: "bg-slate-200 text-slate-700",
  negotiation_lost: "bg-red-100 text-red-800",
  booked: "bg-green-100 text-green-800",
};

export const FINAL_STAGES = ["booked", "negotiation_lost"] as const;

export const OBJECTION_CATEGORIES = [
  { value: "price", label: "Price" },
  { value: "location", label: "Location" },
  { value: "bhk", label: "BHK / Size" },
  { value: "possession", label: "Possession" },
  { value: "amenities", label: "Amenities" },
  { value: "loan", label: "Loan" },
  { value: "family", label: "Family" },
  { value: "comparing", label: "Comparing other projects" },
  { value: "timing", label: "Timing" },
  { value: "trust", label: "Trust / Developer" },
  { value: "other", label: "Other" },
] as const;

export const NEGOTIATION_LOST_REASONS = [
  { value: "price", label: "Price" },
  { value: "location", label: "Location" },
  { value: "competing_project", label: "Competing project" },
  { value: "loan", label: "Loan" },
  { value: "family", label: "Family" },
  { value: "timing", label: "Timing" },
  { value: "customer_dropped", label: "Customer dropped" },
  { value: "other", label: "Other" },
] as const;

export const BOOKING_STATUSES = [
  { value: "initiated", label: "Booking initiated" },
  { value: "confirmed", label: "Booking confirmed" },
  { value: "cancelled", label: "Booking cancelled" },
] as const;

export const BOOKING_STATUS_LABELS: Record<string, string> =
  Object.fromEntries(BOOKING_STATUSES.map((s) => [s.value, s.label]));

export const BOOKING_STATUS_COLORS: Record<string, string> = {
  initiated: "bg-amber-100 text-amber-800",
  confirmed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-700",
};

export const NEXT_ACTION_OPTIONS = [
  "Call customer",
  "Send quotation",
  "Discuss with family",
  "Arrange second visit",
  "Check loan",
  "Follow up",
  "Booking discussion",
] as const;

export function canAccessSales(
  user: AuthUser,
  lead: { assignedSmId: number | null }
): boolean {
  if (user.role === "caller") return false;
  if (user.role === "sales_manager") return lead.assignedSmId === user.id;
  return true;
}

export function toRupees(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `₹${value.toLocaleString("en-IN")}`;
}