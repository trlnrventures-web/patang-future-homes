import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { durationSecondsBetween } from "@/lib/crm/call-sessions-shared";

/**
 * Ten minutes is longer than any real sales call but short enough that a
 * forgotten attempt shows up in the log before the next calling session ends.
 */
export const STALE_CALL_AFTER_SECONDS = 600;

type Db = ReturnType<typeof getDb>;

export type StartCallSessionInput = {
  leadId: number;
  userId: number;
  number?: string | null;
  channel?: "phone" | "whatsapp";
  source?: "call_queue" | "lead_detail" | "lead_card" | "dashboard";
};

/**
 * A caller can only be on one call at a time, so opening an attempt closes any
 * that are still open for the same user — a double tap, a reload, or a queue
 * card that was skipped without logging an outcome. Abandoning rather than
 * completing them keeps an untimed attempt out of the duration totals.
 */
export function startCallSession(db: Db, input: StartCallSessionInput) {
  const now = new Date().toISOString();
  db.update(schema.callSessions)
    .set({ status: "abandoned", endedAt: now })
    .where(
      and(
        eq(schema.callSessions.userId, input.userId),
        eq(schema.callSessions.status, "in_progress")
      )
    )
    .run();

  const row = db
    .insert(schema.callSessions)
    .values({
      leadId: input.leadId,
      userId: input.userId,
      number: input.number || null,
      channel: input.channel || "phone",
      source: input.source || "call_queue",
      status: "in_progress",
      startedAt: now,
      createdAt: now,
    })
    .returning()
    .get();
  return row;
}

/**
 * Closes an attempt against the activity that resolved it. The duration is
 * measured here from the two server timestamps rather than accepted from the
 * client, so the log cannot be inflated by a stalled or edited request.
 */
export function closeCallSession(
  db: Db,
  args: {
    sessionId: number;
    leadId: number;
    activityId: number;
    userId: number;
    outcome: string;
  }
) {
  const session = db
    .select()
    .from(schema.callSessions)
    .where(eq(schema.callSessions.id, args.sessionId))
    .get();
  // Ownership and lead are checked here as well as in the route: a session id
  // belonging to another user or another lead must never be closable from a
  // request they are able to send.
  if (
    !session ||
    session.userId !== args.userId ||
    session.leadId !== args.leadId ||
    session.status !== "in_progress"
  ) {
    return null;
  }

  const now = new Date().toISOString();
  db.update(schema.callSessions)
    .set({
      status: "completed",
      outcome: args.outcome,
      activityId: args.activityId,
      endedAt: now,
      durationSeconds: durationSecondsBetween(session.startedAt, now),
    })
    .where(eq(schema.callSessions.id, session.id))
    .run();

  // The closed row, not the one read above: callers need the duration that was
  // just recorded, and the pre-update copy has none of the new fields.
  return db
    .select()
    .from(schema.callSessions)
    .where(eq(schema.callSessions.id, session.id))
    .get();
}

/**
 * An outcome logged without a preceding dial tap — a caller who used the phone
 * app's own recents, or a WhatsApp call. The attempt is still recorded so the
 * call history is complete, but the duration stays null rather than becoming a
 * zero, which would read as an instant call.
 */
export function recordUntimedCallAttempt(
  db: Db,
  args: {
    leadId: number;
    userId: number;
    activityId: number;
    outcome: string;
    number?: string | null;
    channel?: "phone" | "whatsapp";
  }
) {
  const now = new Date().toISOString();
  db.insert(schema.callSessions)
    .values({
      leadId: args.leadId,
      userId: args.userId,
      activityId: args.activityId,
      number: args.number || null,
      channel: args.channel || "phone",
      source: "manual",
      status: "completed",
      outcome: args.outcome,
      startedAt: now,
      endedAt: now,
      durationSeconds: null,
      createdAt: now,
    })
    .run();
}

/**
 * True auto-save: an attempt the caller dialled but never resolved is still
 * worth keeping, so a sweep closes it into `abandoned` with the duration
 * measured to the moment it was swept rather than dropping it.
 *
 * Safe to call from any request, and safe to call concurrently: only rows still
 * `in_progress` past the cutoff are touched, so a sweep running while an
 * outcome is being saved cannot overwrite that save. Nothing here throws —
 * a failed sweep must not take down the page load that triggered it.
 */
export function closeStaleCallSessions(
  db: Db,
  options: { olderThanSeconds?: number; now?: Date } = {}
): number {
  try {
    const now = options.now ?? new Date();
    const cutoff = new Date(
      now.getTime() - (options.olderThanSeconds ?? STALE_CALL_AFTER_SECONDS) * 1000
    ).toISOString();

    const stale = db
      .select()
      .from(schema.callSessions)
      .where(eq(schema.callSessions.status, "in_progress"))
      .all()
      .filter((s) => s.startedAt < cutoff);

    for (const session of stale) {
      db.update(schema.callSessions)
        .set({
          status: "abandoned",
          endedAt: now.toISOString(),
          durationSeconds: durationSecondsBetween(session.startedAt, now.toISOString()),
        })
        .where(
          and(
            eq(schema.callSessions.id, session.id),
            eq(schema.callSessions.status, "in_progress")
          )
        )
        .run();
    }
    return stale.length;
  } catch (error) {
    console.error("[crm] stale call session sweep failed:", error);
    return 0;
  }
}

/** Sessions for one lead, newest first, for the call-history timeline. */
export function loadCallSessionsForLead(db: Db, leadId: number) {
  return db
    .select()
    .from(schema.callSessions)
    .where(eq(schema.callSessions.leadId, leadId))
    .orderBy(schema.callSessions.startedAt)
    .all()
    .reverse();
}
