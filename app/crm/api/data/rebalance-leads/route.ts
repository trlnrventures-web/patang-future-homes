import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";

export const dynamic = "force-dynamic";

const EXCLUDE = new Set([
  "visit_done",
  "won",
  "booked",
  "visit_booked",
  "visit_confirmed",
  "revisit_scheduled",
]);

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const now = new Date().toISOString();

  const sms = db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.role, "sales_manager"), eq(schema.users.active, true)))
    .all()
    .sort((a, b) => a.id - b.id);

  if (sms.length === 0) {
    return NextResponse.json({ error: "No active sales managers" }, { status: 400 });
  }

  const leads = db
    .select()
    .from(schema.leads)
    .where(isNull(schema.leads.deletedAt))
    .all();

  const eligible = leads.filter((l) => !EXCLUDE.has(l.status));

  // open counts
  const counts = new Map(sms.map((s) => [s.id, 0]));
  for (const l of eligible) {
    if (l.assignedSmId != null && counts.has(l.assignedSmId)) {
      counts.set(l.assignedSmId, counts.get(l.assignedSmId)! + 1);
    }
  }

  let moved = 0;
  eligible.sort((a, b) => a.id - b.id);
  for (const l of eligible) {
    let pick = sms[0].id;
    let best = Infinity;
    for (const s of sms) {
      const c = counts.get(s.id) ?? 0;
      if (c < best) {
        best = c;
        pick = s.id;
      }
    }
    if (l.assignedSmId !== pick || l.assignedCallerId !== pick) moved++;
    db.update(schema.leads)
      .set({
        assignedSmId: pick,
        assignedCallerId: pick,
        assignedAt: now,
        assignedBy: user.id,
        updatedAt: now,
      })
      .where(eq(schema.leads.id, l.id))
      .run();
    counts.set(pick, (counts.get(pick) ?? 0) + 1);
  }

  const finalCounts = Object.fromEntries(counts);
  return NextResponse.json({
    ok: true,
    eligible: eligible.length,
    moved,
    managers: sms.length,
    finalCounts,
  });
}
