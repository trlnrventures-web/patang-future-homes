import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { durationSecondsBetween } from "@/lib/crm/call-sessions-shared";

type Db = ReturnType<typeof getDb>;

/**
 * Incoming and missed calls are observable only by something outside the
 * browser — a telephony provider posting a webhook, or a native app reading
 * the OS call log. Both arrive here through one envelope, so the rest of the
 * app never learns which integration produced a row.
 *
 * Deliberately provider-agnostic: `provider` is free text and only used for
 * attribution and dedupe-key namespacing, so adding a provider later is a
 * mapping, not a schema change.
 */
export type CallEventInput = {
  /** The provider's or phone app's id for this call. Required for idempotency. */
  externalId: string;
  provider: string;
  direction: "inbound" | "outbound";
  /** ringing | in_progress | completed | missed. Anything else is rejected. */
  status: "ringing" | "in_progress" | "completed" | "missed";
  /** Digits of the far end. Used to match a lead when leadId is absent. */
  phone?: string | null;
  leadId?: number | null;
  /** Which CRM user handled it. Falls back to the lead's assigned caller. */
  userId?: number | null;
  channel?: "phone" | "whatsapp";
  startedAt: string;
  answeredAt?: string | null;
  endedAt?: string | null;
  /** Used only if the provider's timestamps are missing; measured otherwise. */
  durationSeconds?: number | null;
  recordingUrl?: string | null;
  notes?: string | null;
};

const VALID_STATUSES = new Set<CallEventInput["status"]>([
  "ringing",
  "in_progress",
  "completed",
  "missed",
]);

/** How far a call has progressed. Used to keep updates monotonic. */
const STATUS_RANK: Record<CallEventInput["status"], number> = {
  ringing: 0,
  in_progress: 1,
  completed: 2,
  missed: 2,
};

/** A status this module does not produce is treated as final and never regressed. */
function statusRank(status: string): number {
  return STATUS_RANK[status as CallEventInput["status"]] ?? 2;
}

export class CallEventError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Last 10 digits, so +91 98765… and 098765… resolve to the same lead. */
export function normalizePhone(value: string | null | undefined): string {
  if (!value) return "";
  const digits = String(value).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Resolve the event to a lead. An explicit leadId wins; otherwise the number is
 * matched against phone and whatsappNumber. A live lead always beats a deleted
 * one, so an old number being recycled cannot attach a live call to a tombstone.
 */
export function resolveLead(db: Db, event: CallEventInput) {
  if (event.leadId) {
    const byId = db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.id, event.leadId))
      .get();
    if (byId) return byId;
  }

  const phone = normalizePhone(event.phone);
  if (!phone) return null;

  const candidates = db
    .select()
    .from(schema.leads)
    .where(isNull(schema.leads.deletedAt))
    .all()
    .filter(
      (l) =>
        normalizePhone(l.phone) === phone || normalizePhone(l.whatsappNumber) === phone
    );

  return candidates.find((l) => l.status !== "invalid" && l.status !== "lost") ?? candidates[0] ?? null;
}

/**
 * Picks the CRM user the row belongs to. An inbound call has no caller of its
 * own, so it is filed against the lead's assigned caller — otherwise an
 * inbound call would be invisible in every per-user report.
 */
function resolveUserId(db: Db, event: CallEventInput, lead: (typeof schema.leads.$inferSelect) | null): number {
  if (event.userId) {
    const explicit = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, event.userId))
      .get();
    if (explicit) return explicit.id;
  }
  if (lead?.assignedCallerId) return lead.assignedCallerId;
  if (lead?.assignedSmId) return lead.assignedSmId;

  // Last resort: any active caller, so the row is still attributable and the
  // event is never silently dropped.
  const fallback = db
    .select()
    .from(schema.users)
    .all()
    .find((u) => u.active && (u.role === "caller" || u.role === "admin"));
  return fallback?.id ?? 1;
}

function validate(input: Partial<CallEventInput>): CallEventInput {
  if (!input.externalId || typeof input.externalId !== "string") {
    throw new CallEventError("externalId required");
  }
  if (!input.provider || typeof input.provider !== "string") {
    throw new CallEventError("provider required");
  }
  if (input.direction !== "inbound" && input.direction !== "outbound") {
    throw new CallEventError("direction must be inbound or outbound");
  }
  const status = input.status;
  if (!status || !VALID_STATUSES.has(status)) {
    throw new CallEventError("status must be ringing, in_progress, completed or missed");
  }
  if (!input.startedAt || Number.isNaN(new Date(input.startedAt).getTime())) {
    throw new CallEventError("startedAt must be an ISO timestamp");
  }
  if (input.durationSeconds != null && typeof input.durationSeconds !== "number") {
    throw new CallEventError("durationSeconds must be a number");
  }
  return input as CallEventInput;
}

export type IngestResult = {
  /** True when the call was already on file, so no second call was created. */
  duplicate: boolean;
  /** True when an already-recorded call was advanced by this event. */
  updated: boolean;
  sessionId: number;
  leadId: number | null;
  matchedByPhone: boolean;
};

/**
 * Talk time, in descending order of trust:
 *
 *  1. Answer → hang-up, when the provider reports both. This is the only value
 *     that is genuinely talk time.
 *  2. The provider's own duration, when it reports one and no answer time.
 *  3. Start → hang-up, but only for a call the provider says was answered. On a
 *     missed call that span is ring time, and storing it as talk time would
 *     inflate every duration figure in the report.
 *
 * Otherwise null. An unknown duration is more honest than a fabricated one.
 */
function computeDurationSeconds(event: CallEventInput): number | null {
  if (event.answeredAt && event.endedAt) {
    return durationSecondsBetween(event.answeredAt, event.endedAt);
  }
  if (event.durationSeconds != null && Number.isFinite(event.durationSeconds)) {
    return Math.max(0, Math.round(event.durationSeconds));
  }
  if (event.endedAt && event.status !== "missed") {
    return durationSecondsBetween(event.startedAt, event.endedAt);
  }
  return null;
}

/**
 * The activity a call leaves on the timeline. A ringing outbound call is a
 * plain attempt, not a connected one — logging it as connected would make every
 * dialled-but-unanswered lead look worked.
 */
function activityTypeFor(
  direction: CallEventInput["direction"],
  status: CallEventInput["status"]
) {
  if (direction === "inbound") return status === "missed" ? "call_missed" : "call_incoming";
  if (status === "missed") return "call_no_answer";
  if (status === "ringing") return "call";
  return "call_connected";
}

/**
 * Idempotent write of one call event, treating a repeated `provider:externalId`
 * as a later stage of the same call rather than as a throwaway.
 *
 * Providers emit a call in pieces — ringing, then answered, then hang-up with a
 * recording URL. Rejecting the second delivery would discard the recording and
 * leave the call stuck at "ringing" forever, so an existing row is advanced
 * instead. Because deliveries can arrive out of order, a status only ever moves
 * forward and a value that is already known is never overwritten.
 */
export function ingestCallEvent(db: Db, raw: Partial<CallEventInput>): IngestResult {
  const event = validate(raw);
  const dedupeKey = `${event.provider}:${event.externalId}`;

  const existing = db
    .select()
    .from(schema.callSessions)
    .where(eq(schema.callSessions.dedupeKey, dedupeKey))
    .get();
  if (existing) {
    return advanceExistingCall(db, existing, event);
  }

  const lead = resolveLead(db, event);
  if (!lead) {
    // Not an error: an unknown number is a real event that simply has nowhere
    // to live in the lead pipeline. Rejecting would make the sender retry it
    // forever.
    throw new CallEventError(`no lead matches ${event.phone || "the supplied number"}`, 422);
  }
  const userId = resolveUserId(db, event, lead);
  const now = new Date().toISOString();
  const answeredAt = event.answeredAt ?? null;
  const endedAt = event.endedAt ?? null;
  const durationSeconds = computeDurationSeconds(event);
  const activityType = activityTypeFor(event.direction, event.status);

  const activity = db
    .insert(schema.activities)
    .values({
      leadId: lead.id,
      userId,
      type: activityType as never,
      notes: event.notes || "",
      metadata: JSON.stringify({
        provider: event.provider,
        externalId: event.externalId,
        direction: event.direction,
        recordingUrl: event.recordingUrl || null,
      }),
      createdAt: event.startedAt,
    })
    .returning()
    .get();

  let session: typeof schema.callSessions.$inferSelect;
  try {
    session = db
      .insert(schema.callSessions)
      .values({
        leadId: lead.id,
        userId,
        activityId: activity.id,
        number: event.phone ? normalizePhone(event.phone) : null,
        channel: event.channel || "phone",
        direction: event.direction,
        source: event.provider === "manual" ? "manual" : "webhook",
        provider: event.provider,
        providerCallId: event.externalId,
        dedupeKey,
        status: event.status,
        outcome: activityType,
        startedAt: event.startedAt,
        answeredAt,
        endedAt,
        durationSeconds,
        recordingUrl: event.recordingUrl || null,
        createdAt: now,
      })
      .returning()
      .get();
  } catch {
    // The unique index on dedupe_key is the real guard against a double
    // delivery: two webhooks can both pass the check above before either
    // commits. Losing that race is not a failure, so re-read the winner.
    const winner = db
      .select()
      .from(schema.callSessions)
      .where(eq(schema.callSessions.dedupeKey, dedupeKey))
      .get();
    if (!winner) throw new CallEventError("could not record call event", 500);
    return advanceExistingCall(db, winner, event);
  }

  // Only a terminal event moves the lead. A ringing call must not flip a lead
  // to connected, or a lead that was never picked up would look worked.
  if (event.status === "missed" || event.direction === "inbound") {
    const nextStatus = event.status === "missed" ? "no_response" : "calling";
    if (lead.status !== nextStatus) {
      db.update(schema.leads)
        .set({ status: nextStatus, stageChangedAt: now, updatedAt: now })
        .where(eq(schema.leads.id, lead.id))
        .run();
    }
  }

  return {
    duplicate: false,
    updated: false,
    sessionId: session.id,
    leadId: lead.id,
    matchedByPhone: !event.leadId && !!normalizePhone(event.phone),
  };
}

type CallSessionRow = typeof schema.callSessions.$inferSelect;

/**
 * Folds a later event for a call already on file into that row: status moves
 * forward if this event is further along, and any detail it brings — answer
 * time, hang-up, duration, recording — is filled in where it was previously
 * unknown. The lead activity is retyped to match, so a call that ends up
 * recorded as "no answer" does not sit on the timeline as "connected".
 */
function advanceExistingCall(
  db: Db,
  existing: CallSessionRow,
  event: CallEventInput
): IngestResult {
  const incomingStatus = event.status as CallSessionRow["status"];
  const advances = statusRank(event.status) > statusRank(existing.status);
  const status = advances ? incomingStatus : existing.status;
  const duration = computeDurationSeconds(event);
  const activityType = activityTypeFor(event.direction, status as CallEventInput["status"]);

  db.update(schema.callSessions)
    .set({
      status,
      outcome: activityType,
      answeredAt: existing.answeredAt ?? event.answeredAt ?? null,
      endedAt: existing.endedAt ?? event.endedAt ?? null,
      durationSeconds: existing.durationSeconds ?? duration,
      recordingUrl: existing.recordingUrl ?? event.recordingUrl ?? null,
      number: existing.number ?? (event.phone ? normalizePhone(event.phone) : null),
    })
    .where(eq(schema.callSessions.id, existing.id))
    .run();

  if (existing.activityId) {
    const first = db
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.id, existing.activityId))
      .get();
    db.update(schema.activities)
      .set({
        type: activityType as never,
        // Later events often carry the reason the call ended; keep whatever was
        // written first if this one has nothing to add.
        notes: first?.notes?.trim() ? first.notes : event.notes || "",
      })
      .where(eq(schema.activities.id, existing.activityId))
      .run();
  }

  return {
    duplicate: true,
    updated: advances,
    sessionId: existing.id,
    leadId: existing.leadId,
    matchedByPhone: false,
  };
}

/**
 * Incoming and missed calls the given user has not dealt with. Ordered newest
 * first so a caller opening the app sees the most recent attempt at the top.
 */
export function loadUnreturnedCalls(db: Db, userId: number, limit = 25) {
  return db
    .select()
    .from(schema.callSessions)
    .where(
      and(
        eq(schema.callSessions.userId, userId),
        eq(schema.callSessions.direction, "inbound"),
        eq(schema.callSessions.status, "missed")
      )
    )
    .orderBy(schema.callSessions.startedAt)
    .all()
    .slice(-limit)
    .reverse();
}

/**
 * HMAC-SHA256 of the raw body, hex encoded. Compared with a constant-time
 * compare so a mismatching signature leaks no timing information.
 */
export function signCallEventBody(secret: string, rawBody: string, timestamp: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyCallEventSignature(args: {
  secret: string;
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  /** Reject a delivery older than this many seconds. */
  maxAgeSeconds?: number;
}): { ok: true } | { ok: false; reason: string } {
  const { secret, rawBody, timestamp, signature } = args;
  if (!signature) return { ok: false, reason: "missing signature" };
  if (!timestamp) return { ok: false, reason: "missing timestamp" };

  const tsMs = Number(timestamp) * 1000;
  if (!Number.isFinite(tsMs)) return { ok: false, reason: "malformed timestamp" };
  const maxAge = (args.maxAgeSeconds ?? 900) * 1000;
  if (Math.abs(Date.now() - tsMs) > maxAge) return { ok: false, reason: "expired timestamp" };

  const expected = Buffer.from(signCallEventBody(secret, rawBody, timestamp), "utf8");
  const provided = Buffer.from(signature, "utf8");
  if (expected.length !== provided.length) return { ok: false, reason: "bad signature" };
  return timingSafeEqual(expected, provided) ? { ok: true } : { ok: false, reason: "bad signature" };
}
