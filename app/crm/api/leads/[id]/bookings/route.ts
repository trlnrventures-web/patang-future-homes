import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, desc } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import { canAccessSales } from "@/lib/crm/sales";
import { getProject } from "@/lib/projects";

export async function GET(
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
  if (!canAccessSales(user, lead)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const bookings = db
    .select()
    .from(schema.bookings)
    .where(eq(schema.bookings.leadId, lead.id))
    .orderBy(desc(schema.bookings.createdAt))
    .all()
    .map((b) => ({
      ...b,
      projectTitle: b.projectId ? getProject(b.projectId)?.title || b.projectId : "",
      smName: db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, b.smId)).get()?.name || "",
    }));

  return NextResponse.json({ bookings });
}

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
  if (!canAccessSales(user, lead)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // empty body
  }

  const now = new Date().toISOString();

  const projectId = String(body.projectId || "").trim();
  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project required" }, { status: 400 });
  }

  const bookingDate = String(body.bookingDate || "").trim();
  if (!bookingDate || Number.isNaN(new Date(bookingDate).getTime())) {
    return NextResponse.json({ error: "Valid booking date required" }, { status: 400 });
  }

  const amountFields: Array<[string, "bookingAmount" | "totalValue"]> = [
    ["bookingAmount", "bookingAmount"],
    ["totalValue", "totalValue"],
  ];
  const values: Record<string, unknown> = {
    leadId: lead.id,
    projectId: project.slug,
    bhk: body.bhk ? String(body.bhk) : lead.bhk,
    bookingDate: new Date(bookingDate).toISOString(),
    smId: user.role === "sales_manager" ? user.id : lead.assignedSmId || user.id,
    leadSource: body.leadSource ? String(body.leadSource) : lead.source,
    campaignName: body.campaignName ? String(body.campaignName) : lead.campaignName,
    status: "initiated",
    createdAt: now,
    updatedAt: now,
  };
  if (body.unit !== undefined && body.unit !== null && body.unit !== "") {
    values.unit = String(body.unit);
  }
  if (body.floor !== undefined && body.floor !== null && body.floor !== "") {
    values.floor = String(body.floor);
  }
  if (body.carpetArea !== undefined && body.carpetArea !== null && body.carpetArea !== "") {
    values.carpetArea = String(body.carpetArea);
  }
  if (body.notes !== undefined && body.notes !== null) {
    values.notes = String(body.notes);
  }

  for (const [field, col] of amountFields) {
    if (body[field] !== undefined && body[field] !== null && body[field] !== "") {
      const n = Number(body[field]);
      if (!Number.isInteger(n) || n < 0) {
        return NextResponse.json(
          { error: "Booking amounts must be non-negative whole numbers" },
          { status: 400 }
        );
      }
      values[col] = n;
    }
  }

  const inserted = db
    .insert(schema.bookings)
    .values(values as typeof schema.bookings.$inferInsert)
    .returning()
    .get();

  db.insert(schema.activities)
    .values({
      leadId: lead.id,
      userId: user.id,
      type: "booking_created",
      notes: `Booking initiated for ${project.title}${inserted.unit ? `, Unit ${inserted.unit}` : ""}`,
      createdAt: now,
    })
    .run();

  return NextResponse.json({
    booking: {
      ...inserted,
      projectTitle: project.title,
      smName: db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, inserted.smId)).get()?.name || "",
    },
  });
}