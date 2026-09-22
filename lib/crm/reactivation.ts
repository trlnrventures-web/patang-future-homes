import { getDb } from "./db";
import * as schema from "./schema";
import { projects } from "@/lib/projects";
import { matchProperties } from "./matching";
import { and, eq, inArray } from "drizzle-orm";
import { getMatchingWeights } from "./settings";

export type ReactivationAlert = {
  id: number;
  projectSlug: string;
  projectTitle: string;
  leadId: number;
  leadName: string;
  status: string;
  matchScore: number;
};

export function scanAndFetchReactivationAlerts(userId?: number): ReactivationAlert[] {
  const db = getDb();
  const setting = db
    .select()
    .from(schema.crmSettings)
    .where(eq(schema.crmSettings.key, "reactivation_scanned_slugs"))
    .get();
  const scanned: string[] = setting ? JSON.parse(setting.value) : [];
  const newProjects = projects.filter((p) => !scanned.includes(p.slug));

  if (newProjects.length > 0) {
    const nurtureLostLeads = db
      .select()
      .from(schema.leads)
      .where(inArray(schema.leads.status, ["nurture", "lost"]))
      .all();
    const weights = getMatchingWeights();

    for (const p of newProjects) {
      for (const lead of nurtureLostLeads) {
        const matches = matchProperties(
          {
            budgetMin: lead.budgetMin,
            budgetMax: lead.budgetMax,
            location: lead.location,
            subLocation: lead.sublocation,
            bhk: lead.bhk,
            timeline: lead.timeline,
            purpose: lead.purpose,
            preferredProject: lead.preferredProject,
            familyRequirements: lead.familyRequirements,
            otherPreferences: lead.otherPreferences,
          },
          1,
          weights,
        );
        const top = matches[0];
        if (top && top.projectSlug === p.slug && top.score >= 50) {
          const exists = db
            .select()
            .from(schema.reactivationAlerts)
            .where(
              and(
                eq(schema.reactivationAlerts.projectSlug, p.slug),
                eq(schema.reactivationAlerts.leadId, lead.id),
              ),
            )
            .get();
          if (!exists) {
            db.insert(schema.reactivationAlerts)
              .values({
                projectSlug: p.slug,
                leadId: lead.id,
                userId: lead.assignedSmId || lead.assignedCallerId || null,
                matchScore: top.score,
                dismissed: false,
                createdAt: new Date().toISOString(),
              })
              .run();
          }
        }
      }
    }

    const allSlugs = [...new Set([...scanned, ...newProjects.map((p) => p.slug)])];
    if (setting) {
      db.update(schema.crmSettings)
        .set({ value: JSON.stringify(allSlugs) })
        .where(eq(schema.crmSettings.key, "reactivation_scanned_slugs"))
        .run();
    } else {
      db.insert(schema.crmSettings)
        .values({
          key: "reactivation_scanned_slugs",
          value: JSON.stringify(allSlugs),
          updatedAt: new Date().toISOString(),
        })
        .run();
    }
  }

  const rows = db
    .select()
    .from(schema.reactivationAlerts)
    .where(userId ? eq(schema.reactivationAlerts.userId, userId) : undefined)
    .all()
    .filter((r) => !r.dismissed);

  const projectsMap = Object.fromEntries(projects.map((p) => [p.slug, p.title]));
  const leadsRows = db.select().from(schema.leads).all();
  const leadsMap = new Map(leadsRows.map((l) => [l.id, l]));

  return rows.map((r) => ({
    id: r.id,
    projectSlug: r.projectSlug,
    projectTitle: projectsMap[r.projectSlug] || r.projectSlug,
    leadId: r.leadId,
    leadName: leadsMap.get(r.leadId)?.name || "",
    status: leadsMap.get(r.leadId)?.status || "",
    matchScore: r.matchScore || 0,
  }));
}
