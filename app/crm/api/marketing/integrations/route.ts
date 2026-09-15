import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/crm/auth";

const MARKETING_ROLES = ["admin", "sales_head", "marketing"];

export async function GET(_request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!MARKETING_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const platforms = [
    { platform: "meta", connected: false, lastSynced: null, syncError: "Meta integration not connected" },
    { platform: "google", connected: false, lastSynced: null, syncError: "Google Ads integration not connected" },
    { platform: "website", connected: true, lastSynced: null, syncError: null },
    { platform: "manual", connected: true, lastSynced: null, syncError: null },
  ];

  return NextResponse.json({ platforms });
}