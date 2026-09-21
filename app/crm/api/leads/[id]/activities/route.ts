import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, and } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import { computeSlaStatus, nextNoResponseAttempt } from "@/lib/crm/sla-compute";

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
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Role access check
  if (user.role === "caller" && lead.assignedCallerId !== user.id && lead.assignedCallerId !== null) {
    if (lead.assignedCallerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  if (user.role === "sales_manager" && lead.assignedSmId && lead.assignedSmId !== user.id) {
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
      whatssap: lead.status === "new" ? "calling" : lead.status,
      qualification: "qualified",
    };
    let newStatus: string | undefined = statusMap[body.type];

    const isCallAttempt =
      body.type === "call_connected" ||
      body.type === "call_no_answer" ||
      body.type === "call_busy" ||
      body.type === "call_wrong_number" ||
      body.type === "call_not_interested" ||
      (body.type === "call" && body.outcome);

    // ---- Call attempt accounting (never fabricates duration) ----
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
      db.insert(schema.siteVisits).values({
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
        createdAt: now,
      }).run();
      newStatus = body.type === "visit_proposed" ? "visit_proposed" : "visit_booked";
      leadUpdates.nextAction = "site_visit";
      if (visitDate) {
        leadUpdates.nextFollowUp = `${visitDate}T${visitTime || "10:00"}`;
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
          .set({ status: "visit_done", doneAt: latestVisit.doneAt || now })
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
        db.update(schema.siteVisits)
          .set({
            status: nextVisitStatus,
            doneAt: body.type === "visit_done" ? now : target.doneAt,
          })
          .where(eq(schema.siteVisits.id, target.id))
          .run();
        if (body.type === "visit_confirmed") {
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
      if (lead.status !== "qualified" && lead.status !== "assigned") update.status = "qualified";
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