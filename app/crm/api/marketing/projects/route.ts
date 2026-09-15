import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/crm/auth";
import { resolveRange, getProjectDemand } from "@/lib/crm/marketing";

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

  const demand = getProjectDemand(range);
  const canViewFinance = user.role === "admin" || user.role === "sales_head";

  return NextResponse.json({
    range,
    canViewFinance,
    byProject: demand.byProject.map((p) => ({
      ...p,
      bookingValue: canViewFinance ? p.bookingValue : null,
    })),
    crossProject: demand.crossProject,
  });
}