import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { buildAttendanceReport } from "@/lib/crm/attendance-report";
import { currentMonthKey } from "@/lib/crm/incentives";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const monthParam = request.nextUrl.searchParams.get("month") || currentMonthKey();
  const month = monthParam.slice(0, 7);
  const userIdParam = request.nextUrl.searchParams.get("userId");
  const userIsAdmin = isAdmin(user);

  const targetUserId = userIdParam && userIsAdmin ? Number(userIdParam) : user.id;

  const report = buildAttendanceReport(targetUserId, month);
  if (!report) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(report);
}
