import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq } from "drizzle-orm";
import { getAuthUser, seesAllLeads } from "@/lib/crm/auth";
import { matchProperties } from "@/lib/crm/matching";
import { getMatchingWeights } from "@/lib/crm/settings";
import { projects } from "@/lib/projects";
import { gradeLead, lowestBhkPriceLakh } from "@/lib/crm/grading";
import { getBudgetStretchPct } from "@/lib/crm/settings";

export const dynamic = "force-dynamic";

/**
 * The internal pitched-project shortlist for one lead.
 *
 * Same projects the website publishes, filtered to what the customer can
 * actually buy and ranked with the CRM's own BEST / GOOD / ALTERNATIVE badges.
 * The result is for the caller's eyes only: templates keep the name hidden
 * until the lead's reveal_allowed flag turns on.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "marketing") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const db = getDb();
  const lead = db.select().from(schema.leads).where(eq(schema.leads.id, Number(id))).get();
  if (!lead || lead.deletedAt) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (
    user.role === "caller" &&
    !seesAllLeads(user) &&
    lead.assignedCallerId != null &&
    lead.assignedCallerId !== user.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const matches = matchProperties(
    {
      location: lead.location,
      budgetMin: lead.budgetMin,
      budgetMax: lead.budgetMax,
      bhk: lead.bhk,
      timeline: lead.timeline,
      purpose: lead.purpose,
    },
    12,
    getMatchingWeights(),
  );

  // The budget gate uses the configured stretch so a just-out-of-range project
  // is still offered as an ALTERNATIVE rather than silently hidden.
  const stretch = getBudgetStretchPct();
  const bhkLowest = lead.bhk ? lowestBhkPriceLakh(lead.bhk) : null;
  const stretchFloor = bhkLowest != null ? bhkLowest * (1 - stretch / 100) : null;
  const budgetMax = lead.budgetMax ?? null;

  const options = matches.map((match) => {
    const project = projects.find((p) => p.slug === match.projectSlug);
    const lowest = project && lead.bhk ? lowestPriceForBhk(project.slug, lead.bhk) : null;
    const budgetOk =
      budgetMax == null || lowest == null ? null : budgetMax >= lowest;
    const stretchOk =
      budgetMax != null && lowest != null && stretchFloor != null
        ? budgetMax >= lowest * (1 - stretch / 100)
        : budgetOk;
    return {
      ...match,
      lowestPriceLakh: lowest,
      budgetOk,
      stretchOk,
      internalLabel: "Internal, do not share with customer",
    };
  });

  const gradePreview = gradeLead({
    location: lead.location,
    bhk: lead.bhk,
    budgetMin: lead.budgetMin,
    budgetMax: lead.budgetMax,
    timeline: lead.timeline,
    visitIntent: lead.visitIntent,
    intentAttempts: lead.visitIntentAttempts,
    stretchPct: stretch,
  });

  return NextResponse.json({
    options,
    current: {
      primary: lead.pitchedProjectSlug,
      backup: lead.backupProjectSlug,
    },
    revealAllowed: lead.revealAllowed,
    gradePreview: { grade: gradePreview.grade, reason: gradePreview.reason },
  });
}

function lowestPriceForBhk(slug: string, bhk: string): number | null {
  const project = projects.find((p) => p.slug === slug);
  if (!project) return null;
  const wanted = String(bhk).replace(/\D/g, "");
  let lowest: number | null = null;
  for (const config of project.configurations) {
    const configBhk = config.type.match(/(\d+)\s*BHK/i)?.[1];
    if (configBhk !== wanted) continue;
    const nums = (config.price.match(/₹?([\d,.]+)\s*(Lacs?|Cr|Lakh|Lakhs?)/gi) || [])
      .map((s) => {
        const clean = s.replace(/[,₹]/g, "").trim();
        const m = clean.match(/([\d.]+)\s*(lakh|lac|lacs|cr|crore)/i);
        if (!m) return null;
        const n = parseFloat(m[1]);
        return /cr|crore/i.test(m[2]) ? n * 100 : n;
      })
      .filter((n): n is number => n != null);
    if (nums.length === 0) continue;
    const min = Math.min(...nums);
    lowest = lowest == null ? min : Math.min(lowest, min);
  }
  return lowest;
}
