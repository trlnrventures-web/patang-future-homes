import { NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { LEAD_STATUS_LABELS, nextActionLabel } from "@/lib/crm/leads";
import { styleHeaderRow, xlsxDownload } from "@/lib/crm/excel";

export const dynamic = "force-dynamic";

/** SQLite caps bound parameters per statement, so ids are fetched in batches. */
const ID_CHUNK = 400;

function nameOf(map: Map<number, string>, id: number | null): string {
  return id ? map.get(id) || "" : "";
}

function daysInStage(lead: { stageChangedAt: string | null; createdAt: string }): number {
  const from = lead.stageChangedAt || lead.createdAt;
  const ms = Date.now() - new Date(from).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 86_400_000) : 0;
}

/**
 * Exports exactly the leads the admin is currently looking at.
 *
 * The board already holds the fully filtered set, so it posts the ids rather
 * than a re-encoding of every filter. That keeps the sheet and the screen in
 * lockstep - a new client-side filter added to the board is honoured here for
 * free, with no chance of the two filter languages drifting apart.
 *
 * Restricted to admin/sales_head, both of whom are never contact-masked, so the
 * sheet always carries real numbers.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user)) {
    return Response.json({ error: "Only admins can export leads" }, { status: 403 });
  }

  let body: { ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((i) => Number.isFinite(Number(i))).map((i) => Number(i)))]
    : [];
  if (ids.length === 0) {
    return Response.json({ error: "Nothing to export" }, { status: 400 });
  }

  const db = getDb();
  const leads: (typeof schema.leads.$inferSelect)[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const batch = ids.slice(i, i + ID_CHUNK);
    leads.push(
      ...db
        .select()
        .from(schema.leads)
        .where(inArray(schema.leads.id, batch))
        .all()
        .filter((l) => l.deletedAt == null)
    );
  }

  if (leads.length === 0) {
    return Response.json({ error: "No matching leads" }, { status: 404 });
  }

  const names = new Map(
    db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .all()
      .map((u) => [u.id, u.name])
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Patang Future Homes CRM";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Leads");
  sheet.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Name", key: "name", width: 22 },
    { header: "Phone", key: "phone", width: 16 },
    { header: "Secondary", key: "secondary", width: 16 },
    { header: "WhatsApp", key: "whatsapp", width: 16 },
    { header: "Email", key: "email", width: 24 },
    { header: "Source", key: "source", width: 12 },
    { header: "Status", key: "status", width: 16 },
    { header: "Sales Manager", key: "sm", width: 20 },
    { header: "Caller", key: "caller", width: 20 },
    { header: "Project", key: "project", width: 22 },
    { header: "Location", key: "location", width: 18 },
    { header: "Sub-location", key: "sublocation", width: 18 },
    { header: "BHK", key: "bhk", width: 10 },
    { header: "Budget", key: "budget", width: 14 },
    { header: "Campaign", key: "campaign", width: 20 },
    { header: "Form", key: "form", width: 20 },
    { header: "Next Action", key: "nextAction", width: 16 },
    { header: "Next Follow-up", key: "nextFollowUp", width: 18 },
    { header: "Days in Stage", key: "daysInStage", width: 14 },
    { header: "Created", key: "created", width: 18 },
  ];
  styleHeaderRow(sheet.getRow(1));
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const lead of leads) {
    sheet.addRow({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      secondary: lead.secondaryPhone || "",
      whatsapp: lead.whatsappNumber,
      email: lead.email || "",
      source: lead.source,
      status: LEAD_STATUS_LABELS[lead.status] || lead.status,
      sm: nameOf(names, lead.assignedSmId),
      caller: nameOf(names, lead.assignedCallerId),
      project: lead.preferredProject || lead.originalProject || "",
      location: lead.location || "",
      sublocation: lead.sublocation || "",
      bhk: lead.bhk || "",
      budget: lead.budget || "",
      campaign: lead.campaignName || "",
      form: lead.formName || "",
      nextAction: nextActionLabel(lead.nextAction),
      nextFollowUp: lead.nextFollowUp || lead.nextAttemptAt || "",
      daysInStage: daysInStage(lead),
      created: lead.createdAt,
    });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return xlsxDownload(`leads-${stamp}.xlsx`, workbook);
}
