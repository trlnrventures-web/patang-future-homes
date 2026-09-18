import { getDb } from "./db";
import * as schema from "./schema";
import { eq, and, gte, lt, sql, inArray, desc, asc } from "drizzle-orm";

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export type Range = { from: string; to: string; label: string; key: string };

export function resolveRange(
  preset: string,
  customFrom?: string | null,
  customTo?: string | null,
): Range {
  const now = Date.now();
  const istNow = new Date(now + IST_OFFSET_MS);
  const today = istNow.toISOString().slice(0, 10);

  function istStart(dateStr: string): string {
    return new Date(`${dateStr}T00:00:00+05:30`).toISOString();
  }
  function istEnd(dateStr: string): string {
    const ms = new Date(`${dateStr}T00:00:00+05:30`).getTime();
    return new Date(ms + 86400000).toISOString();
  }
  function addDays(dateStr: string, days: number): string {
    const ms = new Date(`${dateStr}T00:00:00+05:30`).getTime();
    return new Date(ms + days * 86400000).toISOString().slice(0, 10);
  }
  function startOfMonth(dateStr: string): string {
    return dateStr.slice(0, 7) + "-01";
  }
  function prevMonth(dateStr: string): string {
    const ms = new Date(`${dateStr}T00:00:00+05:30`).getTime() - 86400000;
    return new Date(ms).toISOString().slice(0, 7);
  }

  switch (preset) {
    case "today":
      return { key: "today", from: istStart(today), to: istEnd(today), label: "Today" };
    case "yesterday": {
      const y = addDays(today, -1);
      return { key: "yesterday", from: istStart(y), to: istEnd(y), label: "Yesterday" };
    }
    case "7d":
      return { key: "7d", from: istStart(addDays(today, -6)), to: istEnd(today), label: "Last 7 Days" };
    case "30d":
      return { key: "30d", from: istStart(addDays(today, -29)), to: istEnd(today), label: "Last 30 Days" };
    case "month": {
      const mStart = startOfMonth(today);
      return { key: "month", from: istStart(mStart), to: istEnd(today), label: "This Month" };
    }
    case "last_month": {
      const pm = prevMonth(today);
      const pmStart = startOfMonth(pm);
      const pmEnd = addDays(startOfMonth(today), -1);
      return { key: "last_month", from: istStart(pmStart), to: istEnd(pmEnd), label: "Last Month" };
    }
    case "custom": {
      const f = customFrom || today;
      const t = customTo || today;
      return { key: "custom", from: istStart(f), to: istEnd(t), label: `${f} to ${t}` };
    }
    default:
      return { key: "30d", from: istStart(addDays(today, -29)), to: istEnd(today), label: "Last 30 Days" };
  }
}

export function istToday(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// ─── Activity type constants (match reports.ts) ───

const CALL_TYPES = [
  "call", "call_connected", "call_no_answer", "call_busy",
  "call_wrong_number", "call_back", "call_not_interested", "call_other",
] as const;

const VISIT_COMPLETION_TYPES = ["visit_done", "post_visit_feedback"] as const;

// ─── Types ───

export type CampaignRow = typeof schema.campaigns.$inferSelect;

export type CampaignMetrics = {
  leads: number;
  contacted: number;
  qualified: number;
  visitsBooked: number;
  visitsCompleted: number;
  negotiations: number;
  bookings: number;
  bookingValue: number;
};

export type CampaignWithMetrics = CampaignRow & CampaignMetrics & {
  totalSpend: number;
  cpl: number | null;
  cpql: number | null;
  costPerVisit: number | null;
  costPerBooking: number | null;
};

export type OverviewKPIs = {
  totalSpend: number;
  totalLeads: number;
  cpl: number | null;
  totalQualified: number;
  cpql: number | null;
  totalVisitsBooked: number;
  totalVisitsCompleted: number;
  costPerVisit: number | null;
  totalBookings: number;
  costPerBooking: number | null;
  totalBookingValue: number;
};

export type SourceRow = {
  source: string;
  leads: number;
  contacted: number;
  qualified: number;
  visitsBooked: number;
  visitsCompleted: number;
  negotiations: number;
  bookings: number;
  spend: number;
  cpl: number | null;
  cpql: number | null;
  costPerBooking: number | null;
};

export type ProjectRow = {
  project: string;
  leads: number;
  qualified: number;
  visitsBooked: number;
  visitsCompleted: number;
  negotiations: number;
  bookings: number;
  bookingValue: number;
};

export type CrossProjectRow = {
  originalProject: string;
  bookedProject: string;
  count: number;
};

// ─── Helpers ───

function countLeadActivities(
  type: string,
  leadIds: number[],
  from: string,
  to: string,
): number {
  if (leadIds.length === 0) return 0;
  const db = getDb();
  return db
    .select()
    .from(schema.activities)
    .where(
      and(
        eq(schema.activities.type, type as never),
        inArray(schema.activities.leadId, leadIds),
        gte(schema.activities.createdAt, from),
        lt(schema.activities.createdAt, to),
      ),
    )
    .all().length;
}

function countLeadActivitiesForTypes(
  types: readonly string[],
  leadIds: number[],
  from: string,
  to: string,
): number {
  if (leadIds.length === 0) return 0;
  const db = getDb();
  return db
    .select()
    .from(schema.activities)
    .where(
      and(
        inArray(schema.activities.type, types as unknown as never[]),
        inArray(schema.activities.leadId, leadIds),
        gte(schema.activities.createdAt, from),
        lt(schema.activities.createdAt, to),
      ),
    )
    .all().length;
}

function getMetricsForLeads(
  leadIds: number[],
  from: string,
  to: string,
): CampaignMetrics {
  const m: CampaignMetrics = {
    leads: leadIds.length,
    contacted: 0,
    qualified: 0,
    visitsBooked: 0,
    visitsCompleted: 0,
    negotiations: 0,
    bookings: 0,
    bookingValue: 0,
  };
  if (leadIds.length === 0) return m;

  const db = getDb();

  // Contacted = leads with first_call_at set (among this set)
  const contactedRows = db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(
      and(
        inArray(schema.leads.id, leadIds),
        sql`${schema.leads.firstCallAt} IS NOT NULL`,
        sql`${schema.leads.firstCallAt} != ''`,
      ),
    )
    .all();
  m.contacted = contactedRows.length;

  // Qualified = qualification activity on these leads in range
  m.qualified = countLeadActivities("qualification", leadIds, from, to);

  // Visits booked = site_visits created in range for these leads
  if (leadIds.length > 0) {
    m.visitsBooked = db
      .select()
      .from(schema.siteVisits)
      .where(
        and(
          inArray(schema.siteVisits.leadId, leadIds),
          gte(schema.siteVisits.createdAt, from),
          lt(schema.siteVisits.createdAt, to),
        ),
      )
      .all().length;
  }

  // Visits completed
  const completionRows = db
    .select({ leadId: schema.activities.leadId })
    .from(schema.activities)
    .where(
      and(
        inArray(schema.activities.type, VISIT_COMPLETION_TYPES as unknown as never[]),
        inArray(schema.activities.leadId, leadIds),
        gte(schema.activities.createdAt, from),
        lt(schema.activities.createdAt, to),
      ),
    )
    .all();
  m.visitsCompleted = new Set(completionRows.map((r) => r.leadId)).size;

  // Negotiations
  if (leadIds.length > 0) {
    m.negotiations = db
      .select()
      .from(schema.negotiations)
      .where(
        and(
          inArray(schema.negotiations.leadId, leadIds),
          gte(schema.negotiations.createdAt, from),
          lt(schema.negotiations.createdAt, to),
        ),
      )
      .all().length;
  }

  // Bookings confirmed
  const bookingRows = db
    .select({ totalValue: schema.bookings.totalValue, bookingAmount: schema.bookings.bookingAmount })
    .from(schema.bookings)
    .where(
      and(
        inArray(schema.bookings.leadId, leadIds),
        eq(schema.bookings.status, "confirmed"),
        gte(schema.bookings.updatedAt, from),
        lt(schema.bookings.updatedAt, to),
      ),
    )
    .all();
  m.bookings = bookingRows.length;
  m.bookingValue = bookingRows.reduce(
    (sum, b) => sum + (b.totalValue || b.bookingAmount || 0),
    0,
  );

  return m;
}

// ─── Public API ───

export function getMarketingOverview(range: Range): OverviewKPIs {
  const db = getDb();
  const { from, to } = range;

  // All leads created in range
  const allLeads = db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(gte(schema.leads.createdAt, from), lt(schema.leads.createdAt, to)))
    .all();
  const leadIds = allLeads.map((l) => l.id);

  const m = getMetricsForLeads(leadIds, from, to);

  // Total spend
  const spendRow = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.campaignSpend.spend}), 0)` })
    .from(schema.campaignSpend)
    .where(
      and(gte(schema.campaignSpend.date, from), lt(schema.campaignSpend.date, to)),
    )
    .get();
  const totalSpend = spendRow?.total || 0;

  // Totals
  const totalBookingValueRows = db
    .select({ totalValue: schema.bookings.totalValue, bookingAmount: schema.bookings.bookingAmount })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.status, "confirmed"),
        gte(schema.bookings.updatedAt, from),
        lt(schema.bookings.updatedAt, to),
      ),
    )
    .all();
  const totalBookingValue = totalBookingValueRows.reduce(
    (sum, b) => sum + (b.totalValue || b.bookingAmount || 0),
    0,
  );

  const totalLeadsCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.leads)
    .where(and(gte(schema.leads.createdAt, from), lt(schema.leads.createdAt, to)))
    .get()?.count || 0;

  return {
    totalSpend,
    totalLeads: totalLeadsCount,
    cpl: totalLeadsCount > 0 && totalSpend > 0 ? Math.round(totalSpend / totalLeadsCount) : null,
    totalQualified: m.qualified,
    cpql: m.qualified > 0 && totalSpend > 0 ? Math.round(totalSpend / m.qualified) : null,
    totalVisitsBooked: m.visitsBooked,
    totalVisitsCompleted: m.visitsCompleted,
    costPerVisit: m.visitsBooked > 0 && totalSpend > 0 ? Math.round(totalSpend / m.visitsBooked) : null,
    totalBookings: m.bookings,
    costPerBooking: m.bookings > 0 && totalSpend > 0 ? Math.round(totalSpend / m.bookings) : null,
    totalBookingValue,
  };
}

export function getCampaignList(
  range: Range,
  filters?: { platform?: string; project?: string },
): CampaignWithMetrics[] {
  const db = getDb();
  const { from, to } = range;

  const conditions = [];
  if (filters?.platform && filters.platform !== "all") {
    conditions.push(eq(schema.campaigns.platform, filters.platform as never));
  }
  if (filters?.project && filters.project !== "all") {
    conditions.push(eq(schema.campaigns.project, filters.project));
  }

  const campaignRows = db
    .select()
    .from(schema.campaigns)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.campaigns.createdAt))
    .all();

  return campaignRows.map((c) => {
    // Leads attributed to this campaign by name
    const campaignLeads = db
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.campaignName, c.name),
          gte(schema.leads.createdAt, from),
          lt(schema.leads.createdAt, to),
        ),
      )
      .all();
    const leadIds = campaignLeads.map((l) => l.id);

    const m = getMetricsForLeads(leadIds, from, to);

    // Spend for this campaign in range
    const spendRow = db
      .select({ total: sql<number>`COALESCE(SUM(${schema.campaignSpend.spend}), 0)` })
      .from(schema.campaignSpend)
      .where(
        and(
          eq(schema.campaignSpend.campaignId, c.id),
          gte(schema.campaignSpend.date, from),
          lt(schema.campaignSpend.date, to),
        ),
      )
      .get();
    const totalSpend = spendRow?.total || 0;

    return {
      ...c,
      ...m,
      totalSpend,
      cpl: m.leads > 0 && totalSpend > 0 ? Math.round(totalSpend / m.leads) : null,
      cpql: m.qualified > 0 && totalSpend > 0 ? Math.round(totalSpend / m.qualified) : null,
      costPerVisit: m.visitsBooked > 0 && totalSpend > 0 ? Math.round(totalSpend / m.visitsBooked) : null,
      costPerBooking: m.bookings > 0 && totalSpend > 0 ? Math.round(totalSpend / m.bookings) : null,
    };
  });
}

export function getCampaignDetail(campaignId: number, range: Range) {
  const db = getDb();
  const { from, to } = range;

  const campaign = db
    .select()
    .from(schema.campaigns)
    .where(eq(schema.campaigns.id, campaignId))
    .get();
  if (!campaign) return null;

  const campaignLeads = db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.campaignName, campaign.name),
        gte(schema.leads.createdAt, from),
        lt(schema.leads.createdAt, to),
      ),
    )
    .all();
  const leadIds = campaignLeads.map((l) => l.id);
  const metrics = getMetricsForLeads(leadIds, from, to);

  // Spend
  const spendRow = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.campaignSpend.spend}), 0)` })
    .from(schema.campaignSpend)
    .where(
      and(
        eq(schema.campaignSpend.campaignId, campaignId),
        gte(schema.campaignSpend.date, from),
        lt(schema.campaignSpend.date, to),
      ),
    )
    .get();
  const totalSpend = spendRow?.total || 0;

  // Spend by ad set
  const adSetSpend = db
    .select({
      adSetName: schema.campaignSpend.externalAdSetName,
      spend: sql<number>`SUM(${schema.campaignSpend.spend})`,
      impressions: sql<number>`SUM(${schema.campaignSpend.impressions})`,
      clicks: sql<number>`SUM(${schema.campaignSpend.clicks})`,
      leads: sql<number>`SUM(${schema.campaignSpend.leads})`,
    })
    .from(schema.campaignSpend)
    .where(
      and(
        eq(schema.campaignSpend.campaignId, campaignId),
        gte(schema.campaignSpend.date, from),
        lt(schema.campaignSpend.date, to),
      ),
    )
    .groupBy(schema.campaignSpend.externalAdSetName)
    .all();

  // Leads detail
  const leadsDetail = db
    .select({
      id: schema.leads.id,
      name: schema.leads.name,
      phone: schema.leads.phone,
      originalProject: schema.leads.originalProject,
      budget: schema.leads.budget,
      status: schema.leads.status,
      createdAt: schema.leads.createdAt,
      assignedSmId: schema.leads.assignedSmId,
    })
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.campaignName, campaign.name),
        gte(schema.leads.createdAt, from),
        lt(schema.leads.createdAt, to),
      ),
    )
    .orderBy(asc(schema.leads.createdAt))
    .all();

  // SM names for leads
  const smIds = [...new Set(leadsDetail.filter((l) => l.assignedSmId).map((l) => l.assignedSmId!))];
  const smNames: Record<number, string> = {};
  if (smIds.length > 0) {
    const sms = db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(inArray(schema.users.id, smIds))
      .all();
    sms.forEach((s) => { smNames[s.id] = s.name; });
  }

  // Bookings for these leads
  const bookingsData = leadIds.length > 0
    ? db
        .select({ leadId: schema.bookings.leadId, projectId: schema.bookings.projectId, totalValue: schema.bookings.totalValue, bookingAmount: schema.bookings.bookingAmount })
        .from(schema.bookings)
        .where(
          and(
            inArray(schema.bookings.leadId, leadIds),
            eq(schema.bookings.status, "confirmed"),
          ),
        )
        .all()
    : [];
  const bookingByLead: Record<number, { projectId: string | null; value: number }> = {};
  bookingsData.forEach((b) => {
    bookingByLead[b.leadId] = {
      projectId: b.projectId,
      value: b.totalValue || b.bookingAmount || 0,
    };
  });

  return {
    campaign,
    metrics,
    totalSpend,
    cpl: metrics.leads > 0 && totalSpend > 0 ? Math.round(totalSpend / metrics.leads) : null,
    cpql: metrics.qualified > 0 && totalSpend > 0 ? Math.round(totalSpend / metrics.qualified) : null,
    costPerVisit: metrics.visitsBooked > 0 && totalSpend > 0 ? Math.round(totalSpend / metrics.visitsBooked) : null,
    costPerBooking: metrics.bookings > 0 && totalSpend > 0 ? Math.round(totalSpend / metrics.bookings) : null,
    adSetSpend: adSetSpend.map((a) => ({
      adSetName: a.adSetName || "Unattributed",
      spend: a.spend || 0,
      impressions: a.impressions || 0,
      clicks: a.clicks || 0,
      leads: a.leads || 0,
    })),
    leads: leadsDetail.map((l) => ({
      ...l,
      smName: l.assignedSmId ? smNames[l.assignedSmId] || "Unknown" : "Not assigned",
      booking: bookingByLead[l.id] || null,
    })),
  };
}

export function getSourcePerformance(range: Range): SourceRow[] {
  const db = getDb();
  const { from, to } = range;

  const sources = ["meta", "facebook", "google", "website", "walk_in", "referral", "other"];

  return sources.map((src) => {
    const srcLeads = db
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.source, src as never),
          gte(schema.leads.createdAt, from),
          lt(schema.leads.createdAt, to),
        ),
      )
      .all();
    const leadIds = srcLeads.map((l) => l.id);

    const m = getMetricsForLeads(leadIds, from, to);

    // Spend attributed to this source via campaign platform mapping
    const spendRow = db
      .select({ total: sql<number>`COALESCE(SUM(${schema.campaignSpend.spend}), 0)` })
      .from(schema.campaignSpend)
      .innerJoin(schema.campaigns, eq(schema.campaignSpend.campaignId, schema.campaigns.id))
      .where(
        and(
          eq(schema.campaigns.platform, src as never),
          gte(schema.campaignSpend.date, from),
          lt(schema.campaignSpend.date, to),
        ),
      )
      .get();
    const spend = spendRow?.total || 0;

    return {
      source: src,
      ...m,
      spend,
      cpl: m.leads > 0 && spend > 0 ? Math.round(spend / m.leads) : null,
      cpql: m.qualified > 0 && spend > 0 ? Math.round(spend / m.qualified) : null,
      costPerBooking: m.bookings > 0 && spend > 0 ? Math.round(spend / m.bookings) : null,
    };
  });
}

export function getProjectDemand(range: Range): {
  byProject: ProjectRow[];
  crossProject: CrossProjectRow[];
} {
  const db = getDb();
  const { from, to } = range;

  // Get all distinct original projects from leads in range
  const projectRows = db
    .select({ originalProject: schema.leads.originalProject })
    .from(schema.leads)
    .where(and(gte(schema.leads.createdAt, from), lt(schema.leads.createdAt, to)))
    .all();
  const projects = [...new Set(projectRows.map((r) => r.originalProject).filter(Boolean))] as string[];

  const byProject: ProjectRow[] = projects.map((proj) => {
    const projLeads = db
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.originalProject, proj),
          gte(schema.leads.createdAt, from),
          lt(schema.leads.createdAt, to),
        ),
      )
      .all();
    const leadIds = projLeads.map((l) => l.id);
    const m = getMetricsForLeads(leadIds, from, to);

    // Bookings value for these leads
    const bv = db
      .select({ totalValue: schema.bookings.totalValue, bookingAmount: schema.bookings.bookingAmount })
      .from(schema.bookings)
      .where(
        and(
          inArray(schema.bookings.leadId, leadIds),
          eq(schema.bookings.status, "confirmed"),
        ),
      )
      .all();
    const bookingValue = bv.reduce((sum, b) => sum + (b.totalValue || b.bookingAmount || 0), 0);

    return { project: proj, ...m, bookingValue };
  });

  // Cross-project conversion: original project vs booked project
  const crossProject: CrossProjectRow[] = [];
  const bookedLeads = db
    .select({
      leadId: schema.bookings.leadId,
      projectId: schema.bookings.projectId,
    })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.status, "confirmed"),
        gte(schema.bookings.updatedAt, from),
        lt(schema.bookings.updatedAt, to),
      ),
    )
    .all();

  const bookedLeadIds = bookedLeads.map((b) => b.leadId);
  if (bookedLeadIds.length > 0) {
    const leadOrigins = db
      .select({ id: schema.leads.id, originalProject: schema.leads.originalProject })
      .from(schema.leads)
      .where(inArray(schema.leads.id, bookedLeadIds))
      .all();
    const originMap: Record<number, string | null> = {};
    leadOrigins.forEach((l) => { originMap[l.id] = l.originalProject; });

    const pairs: Record<string, number> = {};
    bookedLeads.forEach((b) => {
      const orig = originMap[b.leadId] || "Not specified";
      const booked = b.projectId || "Not specified";
      if (orig !== booked) {
        const key = `${orig} → ${booked}`;
        pairs[key] = (pairs[key] || 0) + 1;
      }
    });
    Object.entries(pairs).forEach(([key, count]) => {
      const [originalProject, bookedProject] = key.split(" → ");
      crossProject.push({ originalProject, bookedProject, count });
    });
    crossProject.sort((a, b) => b.count - a.count);
  }

  return { byProject, crossProject };
}

export function createCampaign(data: {
  name: string;
  platform?: string;
  project?: string;
  objective?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  status?: string;
  notes?: string;
  externalId?: string;
  externalPlatform?: string;
}): CampaignRow {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db
    .insert(schema.campaigns)
    .values({
      name: data.name,
      platform: (data.platform as "meta" | "facebook" | "google" | "organic" | "website" | "referral" | "other") || "other",
      project: data.project || null,
      objective: data.objective || null,
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      budget: data.budget || null,
      status: (data.status as "active" | "paused" | "completed" | "draft") || "active",
      notes: data.notes || null,
      externalId: data.externalId || null,
      externalPlatform: data.externalPlatform || null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return result;
}

export function updateCampaign(
  campaignId: number,
  data: Partial<{
    name: string;
    platform: string;
    project: string;
    objective: string;
    startDate: string;
    endDate: string;
    budget: number;
    status: string;
    notes: string;
  }>,
): CampaignRow | null {
  const db = getDb();
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (data.name !== undefined) updates.name = data.name;
  if (data.platform !== undefined) updates.platform = data.platform;
  if (data.project !== undefined) updates.project = data.project;
  if (data.objective !== undefined) updates.objective = data.objective;
  if (data.startDate !== undefined) updates.startDate = data.startDate;
  if (data.endDate !== undefined) updates.endDate = data.endDate;
  if (data.budget !== undefined) updates.budget = data.budget;
  if (data.status !== undefined) updates.status = data.status;
  if (data.notes !== undefined) updates.notes = data.notes;

  const result = db
    .update(schema.campaigns)
    .set(updates)
    .where(eq(schema.campaigns.id, campaignId))
    .returning()
    .get();
  return result || null;
}

export function addSpendEntry(
  campaignId: number,
  data: {
    date: string;
    spend: number;
    impressions?: number;
    reach?: number;
    clicks?: number;
    leads?: number;
    externalAdSetName?: string;
    externalAdId?: string;
    externalAdName?: string;
  },
) {
  const db = getDb();
  return db
    .insert(schema.campaignSpend)
    .values({
      campaignId,
      date: data.date,
      spend: data.spend,
      impressions: data.impressions || null,
      reach: data.reach || null,
      clicks: data.clicks || null,
      leads: data.leads || null,
      externalAdSetName: data.externalAdSetName || null,
      externalAdId: data.externalAdId || null,
      externalAdName: data.externalAdName || null,
      createdAt: new Date().toISOString(),
    })
    .returning()
    .get();
}
