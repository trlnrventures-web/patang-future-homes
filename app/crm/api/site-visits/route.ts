import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/crm/auth";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq } from "drizzle-orm";
import { readProjectsFile } from "@/lib/crm/projects-store";
import {
  contactMaskFor,
  describeMasking,
  maskPhone,
} from "@/lib/crm/office-hours";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.role === "marketing") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const allVisits = db.select().from(schema.siteVisits).all();
  const leads = db.select().from(schema.leads).all().filter((l) => !l.deletedAt);
  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const users = db.select().from(schema.users).all();
  const userMap = new Map(users.map((u) => [u.id, u]));

  const projectMap: Record<string, string> = {};
  for (const p of readProjectsFile()) {
    const slug = p.slug;
    const title = String(p.title || slug || "");
    if (slug) projectMap[slug] = title;
    if (title) projectMap[title] = title;
  }

  const isAdmin = user.role === "admin" || user.role === "sales_head";

  const scoped = allVisits.filter((v) => {
    if (!leadMap.has(v.leadId)) return false;
    if (isAdmin) return true;
    if (user.role === "sales_manager") return v.smId === user.id;
    if (user.role === "caller") return leadMap.get(v.leadId)?.assignedCallerId === user.id;
    return false;
  });

  // The calendar shows a lead's number too, so it gets the same server-side
  // mask rather than being left as a bypass around the leads endpoints.
  const decision = contactMaskFor(user.role);

  const visits = scoped
    .map((v) => {
      const lead = leadMap.get(v.leadId);
      return {
        id: v.id,
        leadId: v.leadId,
        customerName: lead?.name || "",
        phone: decision.mask
          ? maskPhone(lead?.whatsappNumber || lead?.phone)
          : lead?.whatsappNumber || lead?.phone || "",
        leadStatus: lead?.status || "",
        projectId: v.projectId,
        projectName: v.projectId ? projectMap[v.projectId] || v.projectId : "",
        smId: v.smId,
        smName: userMap.get(v.smId)?.name || "",
        date: v.date,
        time: v.time,
        status: v.status,
        meetingPoint: v.meetingPoint || "",
        propertyShown: v.propertyShown || "",
      };
    })
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

  return NextResponse.json({
    visits: visits.map((v) => ({ ...v, contactHidden: decision.mask })),
    role: user.role,
    contactMasking: {
      active: decision.mask,
      withinOfficeHours: decision.withinHours,
      banner: describeMasking(decision),
    },
  });
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.role === "marketing") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const visitId = Number(body.visitId);
  if (!visitId) return NextResponse.json({ error: "visitId required" }, { status: 400 });

  const db = getDb();
  const visit = db.select().from(schema.siteVisits).where(eq(schema.siteVisits.id, visitId)).get();
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });

  const visitLead = db.select().from(schema.leads).where(eq(schema.leads.id, visit.leadId)).get();
  if (!visitLead || visitLead.deletedAt) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  const isAdmin = user.role === "admin" || user.role === "sales_head";
  if (!isAdmin && visit.smId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  db.update(schema.siteVisits)
    .set({ status: "cancelled" })
    .where(eq(schema.siteVisits.id, visitId))
    .run();

  return NextResponse.json({ ok: true });
}
