import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/crm/auth";
import { addSpendEntry } from "@/lib/crm/marketing";

const FINANCE_ROLES = ["admin", "sales_head"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!FINANCE_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date || ""))) {
    return NextResponse.json({ error: "Spend date is required (YYYY-MM-DD)" }, { status: 400 });
  }
  const spend = Number(body.spend);
  if (!Number.isFinite(spend) || spend < 0) {
    return NextResponse.json({ error: "Spend amount must be a non-negative number" }, { status: 400 });
  }

  const entry = addSpendEntry(campaignId, {
    date: String(body.date),
    spend: Math.round(spend),
    impressions: typeof body.impressions === "number" ? body.impressions : undefined,
    reach: typeof body.reach === "number" ? body.reach : undefined,
    clicks: typeof body.clicks === "number" ? body.clicks : undefined,
    leads: typeof body.leads === "number" ? body.leads : undefined,
    externalAdSetName: typeof body.externalAdSetName === "string" ? body.externalAdSetName : undefined,
    externalAdId: typeof body.externalAdId === "string" ? body.externalAdId : undefined,
    externalAdName: typeof body.externalAdName === "string" ? body.externalAdName : undefined,
  });

  return NextResponse.json({ entry }, { status: 201 });
}