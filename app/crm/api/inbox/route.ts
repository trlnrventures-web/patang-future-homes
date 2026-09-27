import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import { getAuthUser } from "@/lib/crm/auth";
import { queryInboxLeads } from "@/lib/crm/inbox-query";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const leads = queryInboxLeads(getDb(), user, {
    tab: searchParams.get("tab") || undefined,
    q: searchParams.get("q") || undefined,
    sort: searchParams.get("sort") || undefined,
  });

  return NextResponse.json({ leads });
}
