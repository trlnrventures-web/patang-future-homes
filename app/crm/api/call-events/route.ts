import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { getAuthUser } from "@/lib/crm/auth";
import {
  CallEventError,
  ingestCallEvent,
  loadUnreturnedCalls,
  verifyCallEventSignature,
} from "@/lib/crm/call-events";
import { notifyLeadOwnerOfCall } from "@/lib/crm/call-notifications";

/**
 * Shared secret for provider webhooks and native-app call events. Read from the
 * environment rather than the database so a leaked database backup does not
 * hand over write access to the call log.
 */
const SECRET = process.env.CRM_CALL_EVENTS_SECRET || "";

function reject(reason: string) {
  // The same generic 401 for a missing key, a bad signature and an expired
  // timestamp: distinguishing them tells a prober which part to fix.
  console.warn(`[crm] call-event intake rejected: ${reason}`);
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  if (!SECRET) {
    console.error("[crm] CRM_CALL_EVENTS_SECRET is not set; call-event intake is disabled");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  // The signature covers the raw bytes, so the body is read as text and parsed
  // only after verification.
  const rawBody = await request.text();
  const signature = request.headers.get("x-crm-signature");
  const timestamp = request.headers.get("x-crm-timestamp");

  const verdict = verifyCallEventSignature({
    secret: SECRET,
    rawBody,
    timestamp,
    signature,
  });
  if (!verdict.ok) return reject(verdict.reason);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const db = getDb();
    const result = ingestCallEvent(db, body);

    // A lead phoning in is the one call event the CRM cannot surface on its
    // own, so it is pushed to the assigned caller. Sent after the write and
    // never awaited into the response path: the call is already logged, and a
    // slow or failing push must not make the provider retry.
    if (!result.duplicate && (body.direction === "inbound" || body.status === "missed")) {
      void notifyLeadOwnerOfCall(db, {
        leadId: result.leadId,
        missed: body.status === "missed",
        number: typeof body.phone === "string" ? body.phone : null,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        ...result,
      },
      // 200 rather than 201 on a retry: the sender should not treat an
      // idempotent replay as a new resource.
      { status: result.duplicate ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof CallEventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Call event ingest error:", error);
    return NextResponse.json({ error: "Failed to record call event" }, { status: 500 });
  }
}

/** Incoming calls this user has not returned, newest first. */
export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const sessions = loadUnreturnedCalls(db, user.id);

  // The name travels with each row so the notification payload and the UI can
  // name the lead without a second round trip.
  const leadIds = [...new Set(sessions.map((s) => s.leadId))];
  const leadNames = new Map<number, string>();
  for (const id of leadIds) {
    const lead = db.select().from(schema.leads).where(eq(schema.leads.id, id)).get();
    if (lead) leadNames.set(id, lead.name);
  }

  return NextResponse.json({
    missed: sessions.map((s) => ({
      id: s.id,
      leadId: s.leadId,
      leadName: leadNames.get(s.leadId) || "",
      number: s.number,
      startedAt: s.startedAt,
      provider: s.provider,
    })),
  });
}
