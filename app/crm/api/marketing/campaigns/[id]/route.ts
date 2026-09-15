import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/crm/auth";
import { resolveRange, getCampaignDetail, updateCampaign } from "@/lib/crm/marketing";

const MARKETING_ROLES = ["admin", "sales_head", "marketing"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!MARKETING_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  }

  const p = request.nextUrl.searchParams;
  const range = resolveRange(p.get("range") || "30d", p.get("from"), p.get("to"));

  const detail = getCampaignDetail(campaignId, range);
  if (!detail) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const canViewFinance = user.role === "admin" || user.role === "sales_head";
  return NextResponse.json({
    range,
    canViewFinance,
    ...detail,
    totalSpend: canViewFinance ? detail.totalSpend : null,
    cpl: canViewFinance ? detail.cpl : null,
    cpql: canViewFinance ? detail.cpql : null,
    costPerVisit: canViewFinance ? detail.costPerVisit : null,
    costPerBooking: canViewFinance ? detail.costPerBooking : null,
    metrics: { ...detail.metrics, bookingValue: canViewFinance ? detail.metrics.bookingValue : null },
    adSetSpend: detail.adSetSpend.map((a) => ({
      ...a,
      spend: canViewFinance ? a.spend : null,
    })),
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!MARKETING_ROLES.includes(user.role)) {
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

  if (body.name !== undefined) {
    return NextResponse.json(
      { error: "Campaign name cannot be changed once created (used for lead attribution)" },
      { status: 400 },
    );
  }

  const allowedKeys = ["platform", "project", "objective", "startDate", "endDate", "budget", "status", "notes"];
  const data: Partial<Record<(typeof allowedKeys)[number], string | number>> = {};
  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      const v = body[key];
      if (key === "budget") {
        const n = Number(v);
        data[key] = Number.isFinite(n) ? Math.round(n) : undefined;
      } else if (typeof v === "string") {
        data[key] = v;
      }
    }
  }
  if (Object.values(data).every((v) => v === undefined)) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = updateCampaign(campaignId, data);
  if (!updated) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  return NextResponse.json({ campaign: updated });
}