import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, desc, and } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import { canAccessSales } from "@/lib/crm/sales";
import { getProject } from "@/lib/projects";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bookingId: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, bookingId } = await params;
  const db = getDb();
  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, Number(id))).get();

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (!canAccessSales(user, lead)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const booking = db
    .select()
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.id, Number(bookingId)),
        eq(schema.bookings.leadId, lead.id)
      )
    )
    .get();

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // empty body
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updatedAt: now };

  // Non-status field updates allowed in any active booking
  if (body.bookingDate !== undefined) {
    const d = body.bookingDate ? new Date(String(body.bookingDate)) : null;
    if (!d || Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid booking date" }, { status: 400 });
    }
    update.bookingDate = d.toISOString();
  }
  if (body.notes !== undefined) update.notes = String(body.notes || "");
  if (body.unit !== undefined) update.unit = String(body.unit || "");
  if (body.bhk !== undefined) update.bhk = String(body.bhk || "");
  if (body.floor !== undefined) update.floor = String(body.floor || "");
  if (body.carpetArea !== undefined) update.carpetArea = String(body.carpetArea || "");
  if (body.projectId !== undefined && body.projectId !== null && body.projectId !== "") {
    const p = getProject(String(body.projectId));
    if (p) update.projectId = p.slug;
  }

  for (const field of ["bookingAmount", "totalValue"] as const) {
    if (body[field] !== undefined && body[field] !== null && body[field] !== "") {
      const n = Number(body[field]);
      if (!Number.isInteger(n) || n < 0) {
        return NextResponse.json(
          { error: "Booking amounts must be non-negative whole numbers" },
          { status: 400 }
        );
      }
      update[field] = n;
    }
  }

  const newStatus = body.status ? String(body.status) : null;

  if (newStatus === "confirmed") {
    if (booking.status !== "initiated") {
      return NextResponse.json(
        { error: "Only initiated bookings can be confirmed" },
        { status: 400 }
      );
    }

    // Duplicate protection: another confirmed booking for same project + unit
    if (booking.projectId) {
      const existing = db
        .select({ id: schema.bookings.id })
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.leadId, lead.id),
            eq(schema.bookings.projectId, booking.projectId),
            eq(schema.bookings.status, "confirmed")
          )
        )
        .all();
      const dupes = existing.filter(
        (e) =>
          e.id !== booking.id &&
          (!booking.unit || db.select({ unit: schema.bookings.unit }).from(schema.bookings).where(eq(schema.bookings.id, e.id)).get()?.unit === booking.unit)
      );
      if (dupes.length > 0) {
        return NextResponse.json(
          { error: "A confirmed booking already exists for this unit" },
          { status: 400 }
        );
      }
    }

    update.status = "confirmed";

    db.update(schema.leads).set({
      status: "booked",
      nextAction: "Post-booking follow-up",
      updatedAt: now,
    }).where(eq(schema.leads.id, lead.id)).run();

    const openNegotiation = db
      .select()
      .from(schema.negotiations)
      .where(eq(schema.negotiations.leadId, lead.id))
      .orderBy(desc(schema.negotiations.createdAt))
      .get();
    if (openNegotiation && openNegotiation.status !== "booked" && openNegotiation.status !== "negotiation_lost") {
      db.update(schema.negotiations)
        .set({ status: "booked", updatedAt: now })
        .where(eq(schema.negotiations.id, openNegotiation.id))
        .run();
    }

    db.insert(schema.activities)
      .values({
        leadId: lead.id,
        userId: user.id,
        type: "booking_confirmed",
        notes: `Booking confirmed — ${booking.unit || "Unit not specified"}, ₹${Number(update.bookingAmount ?? booking.bookingAmount ?? 0).toLocaleString("en-IN")}`,
        createdAt: now,
      })
      .run();
  } else if (newStatus === "cancelled") {
    if (booking.status === "cancelled") {
      return NextResponse.json({ error: "Booking already cancelled" }, { status: 400 });
    }

    const reason = String(body.cancellationReason || "").trim();
    if (!reason) {
      return NextResponse.json({ error: "Cancellation reason required" }, { status: 400 });
    }

    update.status = "cancelled";
    update.cancellationReason = reason;

    if (lead.status === "booked") {
      db.update(schema.leads).set({
        status: "negotiation",
        nextAction: "Recover lead — contact customer",
        updatedAt: now,
      }).where(eq(schema.leads.id, lead.id)).run();
    }

    const openNegotiation = db
      .select()
      .from(schema.negotiations)
      .where(eq(schema.negotiations.leadId, lead.id))
      .orderBy(desc(schema.negotiations.createdAt))
      .get();
    if (openNegotiation && openNegotiation.status === "booked") {
      db.update(schema.negotiations)
        .set({ status: "ready_to_book", updatedAt: now })
        .where(eq(schema.negotiations.id, openNegotiation.id))
        .run();
    }

    db.insert(schema.activities)
      .values({
        leadId: lead.id,
        userId: user.id,
        type: "booking_cancelled",
        notes: `Booking cancelled — ${reason}`,
        createdAt: now,
      })
      .run();
  } else if (newStatus && newStatus !== "initiated") {
    return NextResponse.json(
      { error: "Invalid status. Use 'confirmed' or 'cancelled'." },
      { status: 400 }
    );
  }

  if (newStatus) update.status = newStatus;

  db.update(schema.bookings).set(update).where(eq(schema.bookings.id, booking.id)).run();

  const updated = db.select().from(schema.bookings).where(eq(schema.bookings.id, booking.id)).get();

  const project = updated?.projectId ? getProject(updated.projectId) : null;

  return NextResponse.json({
    booking: {
      ...updated,
      projectTitle: project?.title || updated?.projectId || "",
      smName: db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, updated?.smId || 0)).get()?.name || "",
    },
  });
}