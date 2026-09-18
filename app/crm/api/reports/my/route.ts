import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/crm/auth";
import { getDailyMetricsForEmployee, istToday, istDayRange } from "@/lib/crm/reports";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dateParam = request.nextUrl.searchParams.get("date");
  const date = dateParam && dateParam.trim() ? dateParam.trim() : istToday();
  try {
    istDayRange(date);
  } catch {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  // userId is NEVER trusted from the query string: the report is always for the caller.
  const metrics = getDailyMetricsForEmployee(
    { id: user.id, name: user.name, role: user.role },
    date
  );

  return NextResponse.json({
    date,
    role: user.role,
    name: user.name,
    metrics,
  });
}