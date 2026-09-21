import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/crm/auth";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { projects } from "@/lib/projects";
import { marketInventory, marketSlug } from "@/lib/crm/market-inventory";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.role === "marketing") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const allVisits = db.select().from(schema.siteVisits).all();
  const leads = db.select().from(schema.leads).all();
  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const users = db.select().from(schema.users).all();
  const userMap = new Map(users.map((u) => [u.id, u]));

  const projectMap: Record<string, string> = {};
  for (const p of projects) projectMap[p.slug] = p.title;
  for (const e of marketInventory) projectMap[marketSlug(e)] = e.project;

  const isAdmin = user.role === "admin" || user.role === "sales_head";

  const scoped = allVisits.filter((v) => {
    if (isAdmin) return true;
    if (user.role === "sales_manager") return v.smId === user.id;
    if (user.role === "caller") return leadMap.get(v.leadId)?.assignedCallerId === user.id;
    return false;
  });

  const visits = scoped
    .map((v) => {
      const lead = leadMap.get(v.leadId);
      return {
        id: v.id,
        leadId: v.leadId,
        customerName: lead?.name || "",
        phone: lead?.whatsappNumber || lead?.phone || "",
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

  return NextResponse.json({ visits, role: user.role });
}
