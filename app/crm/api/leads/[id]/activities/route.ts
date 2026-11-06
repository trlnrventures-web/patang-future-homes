import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, and } from "drizzle-orm";
import { getAuthUser, seesAllLeads } from "@/lib/crm/auth";
import { computeSlaStatus, nextNoResponseAttempt } from "@/lib/crm/sla-compute";
import { isCallAttemptType } from "@/lib/crm/call-sessions-shared";
import { closeCallSession, recordUntimedCallAttempt } from "@/lib/crm/call-sessions";
import { gradeLead } from "@/lib/crm/grading";
import { getBudgetStretchPct } from "@/lib/crm/settings";
import { alertSalesHeads, routeLeadAfterBooking } from "@/lib/crm/routing";
import {
  completeReminder,
  logNoShow,
  logVisitOutcome,
  onVisitStatusChanged,
  overrideReveal,
  setVisitConfirmation,
} from "@/lib/crm/visit-flow";
import { enterNurture, logNurtureContact } from "@/lib/crm/nurture";
import { writeAuditLog } from "@/lib/crm/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, Number(id))).get();
  if (!lead || lead.deletedAt) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Role access check: callers may add notes/activities to any lead, including
  // one already assigned to an SM or to another caller. Sales managers stay
  // limited to their own leads.
  if (user.role === "sales_manager" && lead.assignedSmId && lead.assignedSmId !== user.id && !seesAllLeads(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const now = new Date().toISOString();
    const metadata = typeof body.metadata === "string" ? body.metadata : JSON.stringify(body.metadata || null);

    const activity = db
      .insert(schema.activities)
      .values({
        leadId: lead.id,
        userId: user.id,
        type: body.type || "note",
        notes: body.notes || "",
        metadata,
        createdAt: now,
      })
      .returning()
      .get();

    // ---- @mention capture in notes (text-based tagging) ----
    if (body.type === "note" && typeof body.notes === "string" && body.notes.includes("@")) {
      const noteLower = body.notes.toLowerCase();
      const candidates = db
        .select()
        .from(schema.users)
        .all()
        .map((u) => {
          const full = u.name.trim().toLowerCase();
          return {
            id: u.id,
            full,
            first: full.split(/\s+/)[0] || "",
          };
        })
        .sort((a, b) => b.full.length - a.full.length);
      const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const mentionedIds = new Set<number>();
      for (const c of candidates) {
        if (mentionedIds.has(c.id) || !c.full || !c.first) continue;
        const fullRe = new RegExp(`@\\s*${escape(c.full)}(?=$|[\\s.,!?;:])`, "i");
        const firstRe = new RegExp(`@\\s*${escape(c.first)}(?=$|[\\s.,!?;:])`, "i");
        if (fullRe.test(noteLower) || firstRe.test(noteLower)) {
          mentionedIds.add(c.id);
        }
      }
      for (const uid of mentionedIds) {
        db.insert(schema.leadMentions)
          .values({
            leadId: lead.id,
            userId: uid,
            mentionedById: user.id,
            noteId: activity.id,
            noteSnippet: body.notes,
            createdAt: now,
          })
          .run();
      }
    }

    const leadUpdates: Record<string, unknown> = {};
    const statusMap: Record<string, string> = {
      call_connected: "connected",
      call_no_answer: "no_response",
      call_busy: "calling",
      call_wrong_number: "invalid",
      call_not_interested: "nurture",
      call_switched_off: "no_response",
      call_number_invalid: "invalid",
      call_whatsapp_only: "connected",
      call_language_barrier: "calling",
      whatssap: lead.status === "new" ? "calling" : lead.status,
      qualification: "qualified",
    };
    let newStatus: string | undefined = statusMap[body.type];

    // ---- Vasai West conversion actions ----------------------------------
    // These are distinct from the older free-form activity types: each one owns
    // its own validation and side effects, then returns immediately.

    if (body.type === "grade") {
      const visitIntent = body.visitIntent || lead.visitIntent || "not_asked";
      const previousIntent = lead.visitIntent;
      let intentAttempts = lead.visitIntentAttempts ?? 0;
      if (visitIntent === "maybe" && previousIntent === "maybe" && body.countAttempt !== false) {
        intentAttempts += 1;
      } else if (visitIntent !== "maybe") {
        intentAttempts = 0;
      }

      const patch: Record<string, unknown> = {
        visitIntent,
        visitIntentAttempts: intentAttempts,
        visitIntentAskedAt: visitIntent === "not_asked" ? null : now,
        updatedAt: now,
      };
      for (const key of ["location", "budget", "budgetMin", "budgetMax", "bhk", "timeline", "fundingStatus", "visitAttendees", "pitchedProjectSlug", "backupProjectSlug"] as const) {
        if (body[key] !== undefined) patch[key] = body[key] === "" ? null : body[key];
      }

      const result = gradeLead({
        location: (patch.location as string) ?? lead.location,
        bhk: (patch.bhk as string) ?? lead.bhk,
        budgetMin: (patch.budgetMin as number) ?? lead.budgetMin,
        budgetMax: (patch.budgetMax as number) ?? lead.budgetMax,
        timeline: (patch.timeline as string) ?? lead.timeline,
        visitIntent,
        intentAttempts,
        stretchPct: getBudgetStretchPct(),
        notInterested: body.notInterested === true,
      });

      if (result.grade == null) {
        db.update(schema.leads).set(patch).where(eq(schema.leads.id, lead.id)).run();
        return NextResponse.json({ ok: true, grade: null, reason: result.reason, breakdown: result.breakdown });
      }

      patch.grade = result.grade;
      patch.gradeReason = result.reason;
      patch.gradeBreakdown = result.breakdown;
      patch.gradedAt = now;
      patch.gradedBy = user.id;
      db.update(schema.leads).set(patch).where(eq(schema.leads.id, lead.id)).run();

      db.insert(schema.activities).values({
        leadId: lead.id,
        userId: user.id,
        type: "status_change",
        notes: `Graded ${result.grade} — ${result.reason}`,
        createdAt: now,
      }).run();

      if (result.grade === "C") {
        enterNurture(db, {
          leadId: lead.id,
          reason: result.nurtureReason || "other",
          actorUserId: user.id,
          note: result.reason,
        });
      } else {
        db.update(schema.leads)
          .set({ status: "qualified", nextAction: "site_visit", updatedAt: now })
          .where(eq(schema.leads.id, lead.id))
          .run();
      }

      const routed = result.grade === "C" ? null : routeLeadAfterBooking(db, lead.id, user.id);
      const fresh = db.select().from(schema.leads).where(eq(schema.leads.id, lead.id)).get();
      return NextResponse.json({ ok: true, grade: result.grade, reason: result.reason, breakdown: result.breakdown, routed, lead: fresh });
    }

    if (body.type === "visit_confirm") {
      const visits = db.select().from(schema.siteVisits).where(eq(schema.siteVisits.leadId, lead.id)).all();
      const target = body.visitId
        ? visits.find((v) => v.id === Number(body.visitId))
        : visits.sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))[0];
      if (!target) return NextResponse.json({ error: "Book the visit before confirming it" }, { status: 400 });

      const pitched = body.pitchedProjectSlug || lead.pitchedProjectSlug;
      if (!pitched) {
        return NextResponse.json({ error: "Pick the pitched project before confirming the visit" }, { status: 400 });
      }

      const visitPatch: Partial<typeof schema.siteVisits.$inferInsert> = {};
      if (body.visitDate) visitPatch.date = String(body.visitDate);
      if (body.visitTime) visitPatch.time = String(body.visitTime);
      if (body.meetingPoint !== undefined) visitPatch.meetingPoint = String(body.meetingPoint || "");
      if (body.familyAttending !== undefined) visitPatch.familyAttending = String(body.familyAttending || "");
      if (body.transportRequirement !== undefined) visitPatch.transportRequirement = String(body.transportRequirement || "");
      if (body.pitchedProjectSlug) visitPatch.pitchedProjectSlug = String(body.pitchedProjectSlug);
      if (body.backupProjectSlug !== undefined) visitPatch.backupProjectSlug = String(body.backupProjectSlug || "");
      visitPatch.status = "booked";
      if (Object.keys(visitPatch).length) {
        db.update(schema.siteVisits).set(visitPatch).where(eq(schema.siteVisits.id, target.id)).run();
      }
      if (body.pitchedProjectSlug || body.visitAttendees) {
        db.update(schema.leads)
          .set({
            ...(body.pitchedProjectSlug ? { pitchedProjectSlug: String(body.pitchedProjectSlug) } : {}),
            ...(body.visitAttendees ? { visitAttendees: body.visitAttendees } : {}),
            updatedAt: now,
          })
          .where(eq(schema.leads.id, lead.id))
          .run();
      }

      const result = setVisitConfirmation(db, {
        visitId: target.id,
        confirmed: body.customerConfirmed !== false,
        actorUserId: user.id,
      });
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

      db.update(schema.leads)
        .set({ status: "visit_confirmed", nextAction: "site_visit", nextFollowUp: `${result.visit.date}T${result.visit.time}`, updatedAt: now })
        .where(eq(schema.leads.id, lead.id))
        .run();

      return NextResponse.json({
        ok: true,
        revealAllowed: result.reveal,
        visit: result.visit,
        lead: db.select().from(schema.leads).where(eq(schema.leads.id, lead.id)).get(),
      });
    }

    if (body.type === "visit_outcome") {
      const outcome = String(body.outcome || "");
      if (!["token_paid", "second_visit", "thinking", "lost"].includes(outcome)) {
        return NextResponse.json({ error: "Choose a valid visit outcome" }, { status: 400 });
      }
      const visits = db.select().from(schema.siteVisits).where(eq(schema.siteVisits.leadId, lead.id)).all();
      const target = body.visitId
        ? visits.find((v) => v.id === Number(body.visitId))
        : visits[visits.length - 1];
      if (!target) return NextResponse.json({ error: "No visit to log an outcome for" }, { status: 400 });
      if (target.outcomeLoggedAt && !["admin", "sales_head"].includes(user.role)) {
        return NextResponse.json({ error: "The outcome was already logged. Ask an Admin or Sales Head to change it." }, { status: 403 });
      }
      if (outcome === "lost" && !String(body.reason || "").trim()) {
        return NextResponse.json({ error: "A lost reason is required" }, { status: 400 });
      }
      const cadence = logVisitOutcome(db, {
        visitId: target.id,
        outcome: outcome as "token_paid" | "second_visit" | "thinking" | "lost",
        reason: body.reason,
        actorUserId: user.id,
      });
      if (target.outcomeLoggedAt) {
        writeAuditLog({
          category: "data",
          action: "visit_outcome_edited",
          actorUserId: user.id,
          entityType: "site_visit",
          entityId: target.id,
          summary: `Outcome changed from ${target.outcome} to ${outcome} on lead ${lead.id}`,
          createdAt: now,
        });
      }
      return NextResponse.json({ ok: true, ...cadence });
    }

    if (body.type === "visit_no_show") {
      const visits = db.select().from(schema.siteVisits).where(eq(schema.siteVisits.leadId, lead.id)).all();
      const target = body.visitId
        ? visits.find((v) => v.id === Number(body.visitId))
        : visits[visits.length - 1];
      if (!target) return NextResponse.json({ error: "No visit to mark as a no-show" }, { status: 400 });
      logNoShow(db, { visitId: target.id, actorUserId: user.id, note: body.notes });
      alertSalesHeads(db, {
        leadId: lead.id,
        kind: "reminder",
        title: "No-show needs rebooking",
        body: `${lead.name} did not turn up for the visit on ${target.date} ${target.time}. A rebook follow-up was created for the caller.`,
      });
      return NextResponse.json({ ok: true });
    }

    if (body.type === "reminder_done") {
      const kind = body.kind === "two_hour" ? "two_hour" : "day_before";
      if (!body.visitId) return NextResponse.json({ error: "visitId is required" }, { status: 400 });
      completeReminder(db, { visitId: Number(body.visitId), kind, actorUserId: user.id, message: body.message });
      return NextResponse.json({ ok: true });
    }

    if (body.type === "nurture_contact") {
      const result = logNurtureContact(db, {
        leadId: lead.id,
        actorUserId: user.id,
        responded: body.responded === true,
        note: body.notes,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.type === "reveal_override") {
      if (!["admin", "sales_head"].includes(user.role)) {
        return NextResponse.json({ error: "Only an Admin or Sales Head can override the reveal" }, { status: 403 });
      }
      if (!String(body.reason || "").trim()) {
        return NextResponse.json({ error: "A reason is required" }, { status: 400 });
      }
      overrideReveal(db, {
        leadId: lead.id,
        allowed: body.allowed !== false,
        actorUserId: user.id,
        reason: String(body.reason),
      });
      return NextResponse.json({ ok: true });
    }


    const isCallAttempt = isCallAttemptType(body.type, body.outcome);

    // ---- Call attempt accounting ----
    if (isCallAttempt) {
      const prevAttempts = lead.attemptCount ?? 0;
      leadUpdates.attemptCount = prevAttempts + 1;
      leadUpdates.lastAttemptAt = now;
      if (!lead.firstCallAt && body.callType !== "inbound") {
        leadUpdates.firstCallAt = now;
        leadUpdates.slaStatus = computeSlaStatus(lead.createdAt, now);
      } else if (!lead.firstCallAt) {
        leadUpdates.firstCallAt = now;
        leadUpdates.slaStatus = computeSlaStatus(lead.createdAt, now);
      }
    }

    // ---- Call log: close the attempt that was opened when Call was tapped ----
    // The duration is measured server side from the two timestamps on the
    // session, so a stalled or tampered request cannot inflate talk time. An
    // outcome logged without a tap still gets a row, carrying no timing rather
    // than a made-up one.
    if (isCallAttempt) {
      const sessionId = Number(body.callSessionId);
      const closed = sessionId
        ? closeCallSession(db, {
            sessionId,
            leadId: lead.id,
            activityId: activity.id,
            userId: user.id,
            outcome: String(body.type),
          })
        : null;
      if (!closed) {
        recordUntimedCallAttempt(db, {
          leadId: lead.id,
          userId: user.id,
          activityId: activity.id,
          outcome: String(body.type),
          channel: body.channel === "whatsapp" ? "whatsapp" : "phone",
        });
      }
    }

    if (body.type === "call_connected") {
      newStatus = "connected";
      if (!lead.firstCallAt) leadUpdates.firstCallAt = now;
      leadUpdates.slaStatus = computeSlaStatus(lead.createdAt, lead.firstCallAt || now);
      const createdMs = new Date(lead.createdAt).getTime();
      const nowMs = new Date(now).getTime();
      leadUpdates.firstResponseTimeSeconds = Math.max(0, Math.round((nowMs - createdMs) / 1000));
      leadUpdates.nextAction = "qualification";
      if (!lead.concern && lead.originalProject) leadUpdates.concern = "none";
    }

    if (body.type === "call_no_answer") {
      newStatus = "no_response";
      const attempts = (lead.attemptCount ?? 0) + 1;
      const nextAt = body.scheduledFollowUp ? String(body.scheduledFollowUp) : nextNoResponseAttempt(attempts);
      leadUpdates.attemptCount = attempts;
      leadUpdates.lastAttemptAt = now;
      leadUpdates.nextAttemptAt = nextAt;
      leadUpdates.nextAction = nextAt ? "callback" : "nurture";
      if (nextAt) {
        leadUpdates.nextFollowUp = nextAt;
        db.insert(schema.followUps).values({
          leadId: lead.id,
          userId: user.id,
          scheduledFor: nextAt,
          purpose: `Call back attempt ${attempts}`,
          status: "pending",
          notes: body.notes || "",
          createdAt: now,
        }).run();
      }
    }

    if (body.type === "call_back" && body.callbackTime) {
      leadUpdates.nextFollowUp = body.callbackTime;
      leadUpdates.nextAction = "callback";
      if (!newStatus) newStatus = lead.status === "new" ? "calling" : lead.status;
      db.insert(schema.followUps).values({
        leadId: lead.id,
        userId: user.id,
        scheduledFor: body.callbackTime,
        purpose: "Call back",
        status: "pending",
        createdAt: now,
      }).run();
    }

    if (body.type === "call_busy") {
      newStatus = "calling";
      leadUpdates.nextAction = "callback";
    }

    if (body.type === "call_wrong_number") {
      newStatus = "invalid";
      leadUpdates.nextAction = "none";
    }

    if (body.type === "call_not_interested") {
      newStatus = "nurture";
      leadUpdates.concern = lead.concern || "not_interested";
      leadUpdates.nextAction = "nurture";
    }

    if (body.type === "call_switched_off") {
      newStatus = "no_response";
      const attempts = (lead.attemptCount ?? 0) + 1;
      const nextAt = body.scheduledFollowUp ? String(body.scheduledFollowUp) : nextNoResponseAttempt(attempts);
      leadUpdates.attemptCount = attempts;
      leadUpdates.lastAttemptAt = now;
      leadUpdates.nextAttemptAt = nextAt;
      leadUpdates.nextAction = nextAt ? "callback" : "nurture";
      if (nextAt) {
        leadUpdates.nextFollowUp = nextAt;
        db.insert(schema.followUps).values({
          leadId: lead.id,
          userId: user.id,
          scheduledFor: nextAt,
          purpose: `Call back attempt ${attempts}`,
          status: "pending",
          notes: body.notes || "",
          createdAt: now,
        }).run();
      }
    }

    if (body.type === "call_number_invalid") {
      newStatus = "invalid";
      leadUpdates.nextAction = "none";
    }

    if (body.type === "call_whatsapp_only") {
      newStatus = "connected";
      leadUpdates.nextAction = "follow_up";
    }

    if (body.type === "call_language_barrier") {
      newStatus = "calling";
      leadUpdates.nextAction = "review_assignment";
    }

    if (
      body.scheduledFollowUp &&
      body.type !== "call_no_answer" &&
      body.type !== "call_back"
    ) {
      const scheduledFor = String(body.scheduledFollowUp);
      leadUpdates.nextFollowUp = scheduledFor;
      leadUpdates.nextAction = body.nextAction || "callback";
      if (lead.status === "new") newStatus = "calling";
      db.insert(schema.followUps).values({
        leadId: lead.id,
        userId: user.id,
        scheduledFor,
        purpose: body.followUpPurpose || "Follow-up after call",
        status: "pending",
        notes: body.notes || "",
        createdAt: now,
      }).run();
    }

    if (body.type === "follow_up") {
      const scheduledFor = body.scheduledFor || body.callbackTime;
      if (scheduledFor) {
        leadUpdates.nextFollowUp = scheduledFor;
        leadUpdates.nextAction = body.nextAction || "follow_up";
        db.insert(schema.followUps).values({
          leadId: lead.id,
          userId: user.id,
          scheduledFor,
          purpose: body.purpose || "Follow-up",
          status: "pending",
          notes: body.notes || "",
          createdAt: now,
        }).run();
        if (body.status && body.status !== lead.status) newStatus = body.status;
        else if (!newStatus && lead.status === "new") newStatus = "follow_up";
      }
    }

    if (body.type === "follow_up_completed") {
      if (body.followUpId) {
        db.update(schema.followUps)
          .set({ status: "completed", completedAt: now })
          .where(eq(schema.followUps.id, Number(body.followUpId)))
          .run();
      } else {
        db.update(schema.followUps)
          .set({ status: "completed", completedAt: now })
          .where(and(eq(schema.followUps.leadId, lead.id), eq(schema.followUps.status, "pending")))
          .run();
      }
      leadUpdates.nextAction = body.nextAction || "follow_up";
      if (body.nextFollowUp) {
        leadUpdates.nextFollowUp = body.nextFollowUp;
        db.insert(schema.followUps).values({
          leadId: lead.id,
          userId: user.id,
          scheduledFor: body.nextFollowUp,
          purpose: body.nextPurpose || "Follow-up",
          status: "pending",
          notes: body.notes || "",
          createdAt: now,
        }).run();
      } else if (body.status) {
        leadUpdates.nextAction = "none";
        newStatus = body.status;
      }
      if (body.status) newStatus = body.status;
    }

    if (body.type === "visit_proposed" || body.type === "visit_booked") {
      const visitDate = body.visitDate;
      const visitTime = body.visitTime;
      const pitchedSlug = body.pitchedProjectSlug || lead.pitchedProjectSlug;
      if (visitDate && visitTime && !pitchedSlug) {
        return NextResponse.json(
          { error: "Pick the pitched project before booking a visit" },
          { status: 400 },
        );
      }
      const insertedVisit = db.insert(schema.siteVisits).values({
        leadId: lead.id,
        projectId: body.projectId || lead.preferredProject || lead.originalProject || null,
        smId: body.smId || lead.assignedSmId || user.id,
        date: visitDate || "",
        time: visitTime || "",
        meetingPoint: body.meetingPoint || "",
        familyAttending: body.familyAttending || "",
        transportRequirement: body.transportRequirement || "",
        status: body.visitStatus || body.type.replace("visit_", ""),
        notes: body.notes || "",
        pitchedProjectSlug: pitchedSlug || null,
        backupProjectSlug: body.backupProjectSlug || lead.backupProjectSlug || null,
        recommendedProperties: Array.isArray(body.recommendedProperties)
          ? JSON.stringify(body.recommendedProperties)
          : null,
        createdAt: now,
      }).returning().get();
      newStatus = body.type === "visit_proposed" ? "visit_proposed" : "visit_booked";
      leadUpdates.nextAction = "site_visit";
      if (visitDate) {
        leadUpdates.nextFollowUp = `${visitDate}T${visitTime || "10:00"}`;
      }
      if (body.pitchedProjectSlug || body.visitAttendees) {
        leadUpdates.pitchedProjectSlug = body.pitchedProjectSlug || lead.pitchedProjectSlug;
        if (body.backupProjectSlug !== undefined) leadUpdates.backupProjectSlug = body.backupProjectSlug || null;
        if (body.visitAttendees) leadUpdates.visitAttendees = body.visitAttendees;
      }
      // A graded lead with a real slot is the routing trigger.
      if (visitDate && visitTime && insertedVisit) {
        routeLeadAfterBooking(db, lead.id, user.id);
      }
    }

    if (body.type === "post_visit_feedback") {
      const visits = db.select().from(schema.siteVisits).where(eq(schema.siteVisits.leadId, lead.id)).all();
      const latestVisit =
        visits.find((v) => body.visitId && v.id === Number(body.visitId)) ||
        visits[visits.length - 1];
      if (latestVisit) {
        db.insert(schema.postVisitFeedback).values({
          visitId: latestVisit.id,
          leadId: lead.id,
          userId: user.id,
          interest: body.interest,
          likedProperty: body.likedProperty,
          mainObjection: body.mainObjection,
          expectedBudget: body.expectedBudget,
          otherProjects: body.otherProjects,
          nextAction: body.nextAction,
          nextFollowUp: body.nextFollowUp,
          notes: body.notes || "",
          createdAt: now,
        }).run();
        db.update(schema.siteVisits)
          .set({
            status: "visit_done",
            doneAt: latestVisit.doneAt || now,
            propertyShown: body.propertyShown || latestVisit.propertyShown || null,
          })
          .where(eq(schema.siteVisits.id, latestVisit.id))
          .run();
      }
      newStatus = lead.status === "booked" ? "booked" : "follow_up";
      leadUpdates.nextAction = body.nextAction || "follow_up";
      if (body.nextFollowUp) {
        leadUpdates.nextFollowUp = body.nextFollowUp;
        db.insert(schema.followUps).values({
          leadId: lead.id,
          userId: user.id,
          scheduledFor: body.nextFollowUp,
          purpose: body.nextPurpose || "Post-visit follow-up",
          status: "pending",
          createdAt: now,
        }).run();
      }
    }

    if (
      body.type === "visit_confirmed" ||
      body.type === "visit_arrived" ||
      body.type === "visit_done" ||
      body.type === "visit_no_show" ||
      body.type === "visit_cancelled"
    ) {
      const visits = db.select().from(schema.siteVisits).where(eq(schema.siteVisits.leadId, lead.id)).all();
      const target =
        visits.find((v) => body.visitId && v.id === Number(body.visitId)) ||
        visits[visits.length - 1];
      const nextVisitStatus =
        body.type === "visit_confirmed"
          ? "confirmed"
          : body.type === "visit_arrived"
            ? "arrived"
            : body.type === "visit_no_show"
              ? "no_show"
              : body.type === "visit_cancelled"
                ? "cancelled"
                : "visit_done";
      if (target) {
        const visitSet: Partial<typeof schema.siteVisits.$inferInsert> = {
          status: nextVisitStatus,
          doneAt: body.type === "visit_done" ? now : target.doneAt,
        };
        if (body.type === "visit_done" && Array.isArray(body.propertiesShown)) {
          visitSet.propertiesShown = JSON.stringify(body.propertiesShown);
          visitSet.propertyShown = body.propertiesShown
            .map((p: { title: string; shown: boolean; added?: boolean }) =>
              p.added
                ? `+ ${p.title} (added)`
                : p.shown
                  ? `${p.title} ✓`
                  : `${p.title} ✗ (not shown)`
            )
            .join(", ");
        } else if (body.type === "visit_done" && body.propertyShown) {
          visitSet.propertyShown = body.propertyShown;
        }
        db.update(schema.siteVisits)
          .set(visitSet)
          .where(eq(schema.siteVisits.id, target.id))
          .run();
        if (body.type === "visit_no_show") {
          logNoShow(db, { visitId: target.id, actorUserId: user.id, note: body.notes });
        } else {
          onVisitStatusChanged(db, target.id, user.id);
        }
        if (body.type === "visit_confirmed") {
          setVisitConfirmation(db, {
            visitId: target.id,
            confirmed: body.customerConfirmed !== false,
            actorUserId: user.id,
          });
          leadUpdates.nextAction = "site_visit";
          if (lead.status !== "negotiation" && lead.status !== "booked") newStatus = "visit_confirmed";
        }
        if (body.type === "visit_done") {
          leadUpdates.nextAction = "post_visit_feedback";
          if (lead.status !== "negotiation" && lead.status !== "booked") newStatus = "visit_done";
        }
      }
    }

    if (body.type === "status_change" && body.status) {
      newStatus = body.status;
      if (body.nextAction) leadUpdates.nextAction = body.nextAction;
    }

    if (body.type === "assignment" && body.smId) {
      const smUser = db.select().from(schema.users).where(eq(schema.users.id, Number(body.smId))).get();
      const smId = Number(body.smId);
      leadUpdates.assignedSmId = smId;
      leadUpdates.assignedAt = now;
      leadUpdates.assignedBy = user.id;
      leadUpdates.status = "assigned";
      leadUpdates.nextAction = "sm_follow_up";
      newStatus = undefined;
      db.update(schema.leads)
        .set({
          assignedSmId: smId,
          assignedAt: now,
          assignedBy: user.id,
          status: "assigned",
          nextAction: "sm_follow_up",
          stageChangedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.leads.id, lead.id))
        .run();
      db.update(schema.activities)
        .set({ notes: `Lead assigned to ${smUser?.name || "SM"}` })
        .where(eq(schema.activities.id, activity.id))
        .run();
      const updated = db.select().from(schema.leads).where(eq(schema.leads.id, lead.id)).get();
      return NextResponse.json({ ok: true, lead: updated });
    }

    if (body.type === "concern" && body.concern) {
      leadUpdates.concern = body.concern;
      leadUpdates.nextAction = "property_matching";
      if (!newStatus && lead.status !== "qualified") newStatus = "calling";
      db.insert(schema.activities).values({
        leadId: lead.id,
        userId: user.id,
        type: "note",
        notes: `Concern recorded: ${body.concern}`,
        createdAt: now,
      }).run();
    }

    if (body.type === "qualification") {
      const quals = body.qualification || {};
      const update: Record<string, unknown> = {};

      if (quals.location) update.location = quals.location;
      if (quals.budget) update.budget = quals.budget;
      if (quals.budgetMin) update.budgetMin = quals.budgetMin;
      if (quals.budgetMax) update.budgetMax = quals.budgetMax;
      if (quals.bhk) update.bhk = quals.bhk;
      if (quals.purpose) update.purpose = quals.purpose;
      if (quals.timeline) update.timeline = quals.timeline;
      if (quals.preferredProject) update.preferredProject = quals.preferredProject;
      if (quals.familyRequirements) update.familyRequirements = quals.familyRequirements;
      if (quals.loanRequired !== undefined) update.loanRequired = quals.loanRequired;
      if (quals.otherPreferences) update.otherPreferences = quals.otherPreferences;
      if (quals.notes) update.notes = quals.notes;
      if (quals.concern) update.concern = quals.concern;
      // Conversion-strategy fields: the dedicated `grade` action still owns the
      // grade decision, but qualification saves the inputs it needs.
      if (quals.visitIntent) {
        update.visitIntent = quals.visitIntent;
        update.visitIntentAskedAt = now;
      }
      if (quals.fundingStatus !== undefined) update.fundingStatus = quals.fundingStatus || null;
      if (quals.visitAttendees) update.visitAttendees = quals.visitAttendees;
      if (quals.pitchedProjectSlug) update.pitchedProjectSlug = quals.pitchedProjectSlug;
      if (quals.backupProjectSlug !== undefined) update.backupProjectSlug = quals.backupProjectSlug || null;
      if (lead.status !== "qualified" && lead.status !== "assigned") {
        update.status = "qualified";
        update.stageChangedAt = now;
      }
      update.nextAction = "review_assignment";
      update.updatedAt = now;

      let score = 0;
      if (quals.budget) score += 30;
      if (quals.location) score += 20;
      if (quals.bhk) score += 15;
      if (quals.timeline && quals.timeline !== "exploring") score += 15;
      if (quals.purpose) score += 10;
      if (quals.preferredProject || quals.otherPreferences) score += 10;
      update.leadScore = score;

      db.update(schema.leads).set(update).where(eq(schema.leads.id, lead.id)).run();

      return NextResponse.json({ ok: true, leadScore: score });
    }

    leadUpdates.updatedAt = now;

    // Apply status + follow-up changes once
    if (newStatus && newStatus !== lead.status) {
      leadUpdates.status = newStatus;
      leadUpdates.stageChangedAt = now;
    }

    if (Object.keys(leadUpdates).length > 0) {
      db.update(schema.leads).set(leadUpdates).where(eq(schema.leads.id, lead.id)).run();
    }

    const updated = db.select().from(schema.leads).where(eq(schema.leads.id, lead.id)).get();
    return NextResponse.json({ ok: true, lead: updated });
  } catch (error) {
    console.error("Add activity error:", error);
    return NextResponse.json({ error: "Failed to add activity" }, { status: 500 });
  }
}