import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { and, eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";
import { writeAuditLog } from "@/lib/crm/audit";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "sales_head") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const db = getDb();
    const now = new Date().toISOString();

    if (body.action === "remove") {
      const id = Number(body.id);
      if (!id) return NextResponse.json({ error: "Invalid holiday" }, { status: 400 });
      const holiday = db.select().from(schema.companyHolidays).where(eq(schema.companyHolidays.id, id)).get();
      if (!holiday || !holiday.active) {
        return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
      }
      db.update(schema.companyHolidays)
        .set({ active: false, removedBy: user.id, removedAt: now })
        .where(eq(schema.companyHolidays.id, id))
        .run();
      writeAuditLog({
        category: "holiday",
        action: "holiday_removed",
        actorUserId: user.id,
        entityType: "company_holiday",
        entityId: id,
        summary: `Removed company holiday "${holiday.name}" on ${holiday.date}.`,
        details: { date: holiday.date, name: holiday.name },
      });
      return NextResponse.json({ ok: true });
    }

    const date = String(body.date || "");
    const name = String(body.name || "").trim().slice(0, 120);
    if (!DATE_RE.test(date) || !name) {
      return NextResponse.json({ error: "A valid date and holiday name are required" }, { status: 400 });
    }

    const duplicate = db
      .select()
      .from(schema.companyHolidays)
      .where(and(eq(schema.companyHolidays.date, date), eq(schema.companyHolidays.active, true)))
      .get();
    if (duplicate) {
      return NextResponse.json({ error: "An active holiday already exists on this date" }, { status: 409 });
    }

    const inserted = db
      .insert(schema.companyHolidays)
      .values({ date, name, createdBy: user.id, createdAt: now })
      .returning({ id: schema.companyHolidays.id })
      .get();

    writeAuditLog({
      category: "holiday",
      action: "holiday_added",
      actorUserId: user.id,
      entityType: "company_holiday",
      entityId: inserted?.id ?? date,
      summary: `Added company holiday "${name}" on ${date}.`,
      details: { date, name },
    });

    return NextResponse.json({ ok: true, id: inserted?.id });
  } catch (error) {
    console.error("Holiday POST error:", error);
    return NextResponse.json({ error: "Failed to update holiday" }, { status: 500 });
  }
}
