import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq } from "drizzle-orm";
import { getAuthUser, seesAllLeads, type AuthUser } from "@/lib/crm/auth";
import { loadCallSessionsForLead, startCallSession } from "@/lib/crm/call-sessions";
import { serverError } from "@/lib/crm/api";

/** Values the `source` column accepts, so a client cannot write a free-text tag into it. */
const SOURCES = new Set([
  "call_queue",
  "lead_detail",
  "lead_card",
  "dashboard",
  "manual",
  "webhook",
  "native_app",
]);

type Lead = typeof schema.leads.$inferSelect;

/**
 * Same scope rules as the activities route: a caller may only work leads they
 * own, and a manager only their own book. Applied to reads as well as writes —
 * without it on GET, any signed-in user could pull another agent's call history
 * by guessing a lead id.
 */
function canActOnLead(user: AuthUser, lead: Lead): boolean {
  if (seesAllLeads(user)) return true;
  if (user.role === "caller") {
    return lead.assignedCallerId === null || lead.assignedCallerId === user.id;
  }
  if (user.role === "sales_manager") {
    return !lead.assignedSmId || lead.assignedSmId === user.id;
  }
  return true;
}

/**
 * Opens an attempt the instant the caller taps Call. Closing it is not a second
 * request: the outcome POST to /crm/api/leads/[id]/activities carries the
 * session id and closes the row in the same write, so an attempt can never be
 * logged without its timing.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const leadId = Number(body.leadId);
    if (!leadId) {
      return NextResponse.json({ error: "leadId required" }, { status: 400 });
    }

    const db = getDb();
    const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
    if (!lead || lead.deletedAt) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (!canActOnLead(user, lead)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const session = startCallSession(db, {
      leadId,
      userId: user.id,
      // The masked number is never stored: outside office hours the UI cannot
      // dial, so there is no session to open, and a masked string in the log
      // would be misleading rather than private.
      number: body.number || null,
      channel: body.channel === "whatsapp" ? "whatsapp" : "phone",
      source: SOURCES.has(body.source) ? body.source : "call_queue",
    });

    return NextResponse.json(
      { id: session.id, startedAt: session.startedAt },
      { status: 201 }
    );
  } catch (error) {
    return serverError(error);
  }
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const leadId = Number(new URL(request.url).searchParams.get("leadId"));
  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const db = getDb();
  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, leadId)).get();
  if (!lead || lead.deletedAt) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (!canActOnLead(user, lead)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessions = loadCallSessionsForLead(db, leadId);
  const userNames = new Map<number, string>(
    db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .all()
      .map((u) => [u.id, u.name])
  );

  return NextResponse.json({
    sessions: sessions.map((s) => ({ ...s, userName: userNames.get(s.userId) || "" })),
  });
}
