import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { getTeamReport, istToday, istDayRange } from "@/lib/crm/reports";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dateParam = request.nextUrl.searchParams.get("date");
  const date = dateParam && dateParam.trim() ? dateParam.trim() : istToday();
  try {
    istDayRange(date);
  } catch {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  return NextResponse.json(getTeamReport(date));
}