import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import { matchProperties } from "@/lib/crm/matching";
import { getMatchingWeights } from "@/lib/crm/settings";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, Number(id))).get();
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (user.role === "caller" && lead.assignedCallerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (user.role === "sales_manager" && lead.assignedSmId && lead.assignedSmId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const matches = matchProperties(
    {
      budgetMin: lead.budgetMin,
      budgetMax: lead.budgetMax,
      location: lead.location,
      bhk: lead.bhk,
      timeline: lead.timeline,
      purpose: lead.purpose,
      preferredProject: lead.preferredProject,
      familyRequirements: lead.familyRequirements,
      otherPreferences: lead.otherPreferences,
    },
    5,
    getMatchingWeights()
  );

  return NextResponse.json({ matches });
}