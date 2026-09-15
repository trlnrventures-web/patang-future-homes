export const MESSAGE_CATEGORIES = [
  { value: "first_contact", label: "First Contact" },
  { value: "missed_call", label: "Missed Call" },
  { value: "no_answer", label: "No Answer" },
  { value: "requirement_confirmation", label: "Requirement Confirmation" },
  { value: "property_option", label: "Property Option" },
  { value: "alternative_project", label: "Alternative Project" },
  { value: "budget_alternative", label: "Budget Alternative" },
  { value: "follow_up", label: "Follow-up" },
  { value: "site_visit_proposal", label: "Site Visit Proposal" },
  { value: "site_visit_confirmation", label: "Site Visit Confirmation" },
  { value: "day_before_reminder", label: "Day-Before Visit Reminder" },
  { value: "same_day_reminder", label: "Same-Day Visit Reminder" },
  { value: "post_visit", label: "Post-Visit" },
  { value: "negotiation", label: "Negotiation" },
  { value: "nurture", label: "Nurture" },
  { value: "custom", label: "Custom" },
] as const;

export const MESSAGE_CATEGORY_LABELS: Record<string, string> =
  Object.fromEntries(MESSAGE_CATEGORIES.map((c) => [c.value, c.label]));

export const AVAILABLE_VARIABLES = [
  "{{name}}",
  "{{first_name}}",
  "{{project}}",
  "{{original_project}}",
  "{{location}}",
  "{{bhk}}",
  "{{budget}}",
  "{{budget_min}}",
  "{{budget_max}}",
  "{{possession}}",
  "{{visit_date}}",
  "{{visit_time}}",
  "{{sm_name}}",
  "{{sm_phone}}",
  "{{company_name}}",
  "{{timeline}}",
] as const;

export type LeadSnapshot = {
  name?: string;
  first_name?: string;
  project?: string;
  original_project?: string;
  location?: string;
  bhk?: string;
  budget?: string;
  budget_min?: string;
  budget_max?: string;
  possession?: string;
  visit_date?: string;
  visit_time?: string;
  sm_name?: string;
  sm_phone?: string;
  company_name?: string;
  timeline?: string;
};

function displayBudget(lead: Record<string, unknown>): string {
  const min = lead.budgetMin ? String(lead.budgetMin) : "";
  const max = lead.budgetMax ? String(lead.budgetMax) : "";
  if (min && max && min !== max) {
    return `₹${min}–${max}L`;
  }
  if (min) return `₹${min}L`;
  if (max) return `₹${max}L`;
  return typeof lead.budget === "string" ? lead.budget : "";
}

function displayTimeline(value: unknown): string {
  const map: Record<string, string> = {
    immediate: "Immediate",
    "1_3_months": "1–3 months",
    "3_6_months": "3–6 months",
    "6_plus_months": "6+ months",
    exploring: "Just exploring",
  };
  return map[String(value)] || (typeof value === "string" ? value : "");
}

export function buildLeadContext(
  lead: Record<string, unknown>,
  extra: Partial<LeadSnapshot> = {}
): LeadSnapshot {
  const name = (lead.name as string) || "";
  const fullBudget = displayBudget(lead);
  const stores = (lead.originalProject as string) || extra.original_project || "";

  let visitDate = extra.visit_date || "";
  let visitTime = extra.visit_time || "";
  if (!visitDate && typeof lead.nextVisitDate === "string") visitDate = lead.nextVisitDate;
  if (!visitTime && typeof lead.nextVisitTime === "string") visitTime = lead.nextVisitTime;
  if (typeof lead.visitDate === "string" && !visitDate) visitDate = lead.visitDate;
  if (typeof lead.visitTime === "string" && !visitTime) visitTime = lead.visitTime;

  const possession = typeof lead.possession === "string" ? lead.possession : "";

  return {
    name: name || "Sir",
    first_name: name.split(" ")[0] || "Sir",
    project: (lead.preferredProject as string) || (lead.project as string) || "",
    original_project: stores,
    location: (lead.location as string) || "Vasai West",
    bhk: (lead.bhk as string) || "",
    budget: fullBudget,
    budget_min: lead.budgetMin ? String(lead.budgetMin) : "",
    budget_max: lead.budgetMax ? String(lead.budgetMax) : "",
    possession,
    visit_date: visitDate || "",
    visit_time: visitTime || "",
    sm_name: extra.sm_name || "",
    sm_phone: extra.sm_phone || "",
    company_name: "Patang Future Homes",
    timeline: displayTimeline(lead.timeline),
  };
}

function stripUnusedSegments(text: string): string {
  const out = text;
  // Handle optional sentences that contain {{...}} but the variable is empty
  // This only strips segments we know are optional wrappers
  return out;
}

export function renderMessage(
  templateBody: string,
  context: LeadSnapshot
): string {
  let out = templateBody;

  const v = (val: unknown) => (typeof val === "string" ? val : "");
  out = out.replace(/\{\{\s*name\s*\}\}/g, () => v(context.name));
  out = out.replace(/\{\{\s*first_name\s*\}\}/g, () => v(context.first_name));
  out = out.replace(/\{\{\s*project\s*\}\}/g, () => v(context.project));
  out = out.replace(/\{\{\s*original_project\s*\}\}/g, () => v(context.original_project));
  out = out.replace(/\{\{\s*location\s*\}\}/g, () => v(context.location));
  out = out.replace(/\{\{\s*bhk\s*\}\}/g, () => v(context.bhk));
  out = out.replace(/\{\{\s*budget\s*\}\}/g, () => v(context.budget));
  out = out.replace(/\{\{\s*budget_min\s*\}\}/g, () => v(context.budget_min));
  out = out.replace(/\{\{\s*budget_max\s*\}\}/g, () => v(context.budget_max));
  out = out.replace(/\{\{\s*possession\s*\}\}/g, () => v(context.possession));
  out = out.replace(/\{\{\s*visit_date\s*\}\}/g, () => v(context.visit_date));
  out = out.replace(/\{\{\s*visit_time\s*\}\}/g, () => v(context.visit_time));
  out = out.replace(/\{\{\s*sm_name\s*\}\}/g, () => v(context.sm_name));
  out = out.replace(/\{\{\s*sm_phone\s*\}\}/g, () => v(context.sm_phone));
  out = out.replace(/\{\{\s*company_name\s*\}\}/g, () => v(context.company_name));
  out = out.replace(/\{\{\s*timeline\s*\}\}/g, () => v(context.timeline));

  // Handle remaining unresolved variables gracefully
  out = out.replace(/\{\{\s*[a-z_]+\s*\}\}/gi, (match) => {
    const key = match.replace(/\{\{|\}\}|\s/g, "");
    const value = context[key as keyof LeadSnapshot];
    return typeof value === "string" ? value : "";
  });

  out = stripUnusedSegments(out);

  // Clean up awkward empty-adjacent text
  out = out.replace(/\s{3,}/g, " ");
  out = out.replace(/,\s*,/g, ",");
  out = out.replace(/\.\s*\}/g, ".");
  out = out.trim();

  return out;
}

export function suggestCategory(lead: Record<string, unknown>): string {
  const status = String(lead.status || "");
  const concern = String(lead.concern || "").toLowerCase();

  if (concern.includes("budget")) return "budget_alternative";
  if (concern.includes("project") || concern.includes("location")) return "alternative_project";

  if (status === "no_response") return "no_answer";
  if (status === "new" || status === "calling") return "first_contact";
  if (status === "connected") return "requirement_confirmation";
  if (status === "visit_booked" || status === "visit_confirmed") return "site_visit_confirmation";
  if (status === "visit_done") return "post_visit";
  if (status === "negotiation") return "negotiation";
  if (status === "nurture") return "nurture";
  if (status === "follow_up") return "follow_up";
  if (status === "qualified" || status === "assigned") return "property_option";

  return "first_contact";
}

export function formatPhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length > 12) return digits;
  return digits;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const number = formatPhoneForWhatsApp(phone);
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function formatMessageTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) {
      const mins = Math.max(1, Math.floor(diff / (1000 * 60)));
      return `${mins}m ago`;
    }
    if (hours < 24) return `${hours}h ago`;
    if (hours < 48) return "Yesterday";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}