import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/crm/auth";
import { resolveRange, getCampaignList, createCampaign, istToday } from "@/lib/crm/marketing";

const MARKETING_ROLES = ["admin", "sales_head", "marketing"];

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!MARKETING_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const range = resolveRange(
    params.get("range") || "30d",
    params.get("from"),
    params.get("to"),
  );
  const platform = params.get("platform") || "all";
  const project = params.get("project") || "all";

  const campaigns = getCampaignList(range, { platform, project });
  const canViewFinance = user.role === "admin" || user.role === "sales_head";

  return NextResponse.json({
    range,
    canViewFinance,
    campaigns: campaigns.map((c) => ({
      ...c,
      totalSpend: canViewFinance ? c.totalSpend : null,
      cpl: canViewFinance ? c.cpl : null,
      cpql: canViewFinance ? c.cpql : null,
      costPerVisit: canViewFinance ? c.costPerVisit : null,
      costPerBooking: canViewFinance ? c.costPerBooking : null,
      bookingValue: canViewFinance ? c.bookingValue : null,
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!MARKETING_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
  }
  if (body.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate as string)) {
    return NextResponse.json({ error: "Invalid start date" }, { status: 400 });
  }
  if (body.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate as string)) {
    return NextResponse.json({ error: "Invalid end date" }, { status: 400 });
  }

  const campaign = createCampaign({
    name: (body.name as string).trim(),
    platform: typeof body.platform === "string" ? body.platform : undefined,
    project: typeof body.project === "string" ? body.project : undefined,
    objective: typeof body.objective === "string" ? body.objective : undefined,
    startDate: typeof body.startDate === "string" ? body.startDate : undefined,
    endDate: typeof body.endDate === "string" ? body.endDate : undefined,
    budget: typeof body.budget === "number" ? body.budget : undefined,
    status: typeof body.status === "string" ? body.status : undefined,
    notes: typeof body.notes === "string" ? body.notes : undefined,
    externalId: typeof body.externalId === "string" ? body.externalId : undefined,
    externalPlatform: typeof body.externalPlatform === "string" ? body.externalPlatform : undefined,
  });

  return NextResponse.json({ campaign, today: istToday() }, { status: 201 });
}