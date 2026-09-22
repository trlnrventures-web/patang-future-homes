import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, getDashboardData } from "@/lib/crm/data";
import { getDailyMetricsForEmployee, istToday, istNow } from "@/lib/crm/reports";
import { Card, Badge } from "@/components/crm/ui";
import CallerDashboard from "@/components/crm/CallerDashboard";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { projects, priceValidityInfo } from "@/lib/projects";
import { dealHealthFor, elapsedSinceMs, FINAL_STAGES, NEGOTIATION_STATUS_LABELS } from "@/lib/crm/sales";
import { matchProperties } from "@/lib/crm/matching";
import { getMatchingWeights } from "@/lib/crm/settings";
import { scanAndFetchReactivationAlerts } from "@/lib/crm/reactivation";

export const metadata: Metadata = {
  title: { absolute: "Dashboard | Patang CRM" },
  robots: { index: false, follow: false },
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/crm/login");

const data = await getDashboardData(user);

  const isAdmin = user.role === "admin" || user.role === "sales_head";
  const isSm = user.role === "sales_manager";
  const isCaller = user.role === "caller";

const smMetrics =
    isSm ? getDailyMetricsForEmployee({ id: user.id, name: user.name, role: user.role }, istToday()) : null;

  const db = getDb();
  const today = istToday();
  const threeHoursMs = 3 * 3600 * 1000;
  const projectToTitle = Object.fromEntries(projects.map((p) => [p.slug, p.title]));
  const usersMap = new Map(db.select().from(schema.users).all().map((u) => [u.id, u.name]));
  const leadsMap = new Map(db.select().from(schema.leads).all().map((l) => [l.id, l]));

  const lastActiveFor = (
    n: { updatedAt: string },
    leadId: number,
    latestByLead: Map<number, string>
  ) =>
    [n.updatedAt, latestByLead.get(leadId)]
      .filter((x): x is string => Boolean(x))
      .sort()
      .pop() || n.updatedAt;

  // ---- SM dashboards ----
  const scheduledVisits: {
    id: number;
    time: string;
    leadId: number;
    projectId: string | null;
    meetingPoint: string | null;
    status: string;
    customerName: string;
    projectName: string;
  }[] = [];
  let dealHealthList: {
    leadId: number;
    customerName: string;
    projectName: string;
    status: string;
    health: ReturnType<typeof dealHealthFor>;
  }[] = [];
  const feedbackPending: {
    visitId: number;
    leadId: number;
    projectName: string;
    customerName: string;
    link: string;
  }[] = [];
  const taggingPending: {
    visitId: number;
    leadId: number;
    projectName: string;
    customerName: string;
    status: string;
    overdue: boolean;
    link: string;
  }[] = [];
  // ---- Admin dashboards ----
  let adminNegotiationsNeedingAttention: {
    leadId: number;
    customerName: string;
    projectName: string;
    smName: string;
    health: ReturnType<typeof dealHealthFor>;
  }[] = [];
  const adminFeedbackPending: {
    visitId: number;
    leadId: number;
    projectName: string;
    customerName: string;
    smName: string;
    link: string;
  }[] = [];
  const adminTaggingPending: {
    visitId: number;
    leadId: number;
    projectName: string;
    customerName: string;
    smName: string;
    status: string;
    overdue: boolean;
    link: string;
  }[] = [];

  // A visit needs property tagging when its scheduled time has passed but it
  // is still open, or it was closed without any properties tagged.
  const nowIst = istNow();
  const needsTagging = (v: {
    date: string;
    time: string;
    status: string;
    propertyShown: string | null;
    propertiesShown: string | null;
  }) => {
    if (v.status === "cancelled" || v.status === "no_show") return false;
    if (v.status === "visit_done") return !v.propertiesShown && !v.propertyShown;
    return Boolean(v.date) && `${v.date}T${v.time || "23:59"}` < nowIst;
  };

  if (isSm) {
    const dayVisits = db
      .select()
      .from(schema.siteVisits)
      .where(and(eq(schema.siteVisits.smId, user.id), eq(schema.siteVisits.date, today)))
      .orderBy(schema.siteVisits.time)
      .all()
      .filter((v) => v.status !== "cancelled" && v.status !== "no_show");
    for (const v of dayVisits) {
      scheduledVisits.push({
        id: v.id,
        time: v.time,
        leadId: v.leadId,
        projectId: v.projectId,
        meetingPoint: v.meetingPoint,
        status: v.status,
        customerName: leadsMap.get(v.leadId)?.name || "",
        projectName: (v.projectId && (projectToTitle[v.projectId] || v.projectId)) || "",
      });
    }

    const activeNegotiations = db
      .select()
      .from(schema.negotiations)
      .all()
      .filter(
        (n) =>
          n.assignedSmId === user.id &&
          !FINAL_STAGES.includes(n.status as (typeof FINAL_STAGES)[number])
      );
    const negLeadIds = [...new Set(activeNegotiations.map((n) => n.leadId))];
    const latestByLead = new Map<number, string>();
    for (const a of db
      .select()
      .from(schema.activities)
      .where(inArray(schema.activities.leadId, negLeadIds.length ? negLeadIds : [0]))
      .orderBy(desc(schema.activities.createdAt))
      .all()) {
      if (!latestByLead.has(a.leadId)) latestByLead.set(a.leadId, a.createdAt);
    }
    dealHealthList = activeNegotiations
      .map((n) => ({
        leadId: n.leadId,
        customerName: leadsMap.get(n.leadId)?.name || "",
        projectName: (n.projectId && (projectToTitle[n.projectId] || n.projectId)) || "",
        status: n.status,
        health: dealHealthFor(lastActiveFor(n, n.leadId, latestByLead)),
      }))
      .sort((a, b) => b.health.days - a.health.days);

    const doneVisits = db
      .select()
      .from(schema.siteVisits)
      .where(and(eq(schema.siteVisits.smId, user.id), eq(schema.siteVisits.status, "visit_done")))
      .all();
    for (const v of doneVisits) {
      if (db.select().from(schema.postVisitFeedback).where(eq(schema.postVisitFeedback.visitId, v.id)).get()) {
        continue;
      }
      const doneMs = new Date(v.doneAt || v.createdAt).getTime();
      if (doneMs && elapsedSinceMs(doneMs) >= threeHoursMs) {
        feedbackPending.push({
          visitId: v.id,
          leadId: v.leadId,
          customerName: leadsMap.get(v.leadId)?.name || "",
          projectName: (v.projectId && (projectToTitle[v.projectId] || v.projectId)) || "",
          link: `/crm/leads/${v.leadId}/negotiation?feedback=${v.id}`,
        });
      }
    }

    const smVisits = db
      .select()
      .from(schema.siteVisits)
      .where(eq(schema.siteVisits.smId, user.id))
      .all();
    for (const v of smVisits) {
      if (!needsTagging(v)) continue;
      taggingPending.push({
        visitId: v.id,
        leadId: v.leadId,
        customerName: leadsMap.get(v.leadId)?.name || "",
        projectName: (v.projectId && (projectToTitle[v.projectId] || v.projectId)) || "",
        status: v.status,
        overdue: v.status !== "visit_done",
        link: `/crm/leads/${v.leadId}?visit=1`,
      });
    }
  }

  if (isAdmin) {
    const allActive = db
      .select()
      .from(schema.negotiations)
      .all()
      .filter((n) => !FINAL_STAGES.includes(n.status as (typeof FINAL_STAGES)[number]));
    const allNegLeadIds = [...new Set(allActive.map((n) => n.leadId))];
    const allLatestByLead = new Map<number, string>();
    for (const a of db
      .select()
      .from(schema.activities)
      .where(inArray(schema.activities.leadId, allNegLeadIds.length ? allNegLeadIds : [0]))
      .orderBy(desc(schema.activities.createdAt))
      .all()) {
      if (!allLatestByLead.has(a.leadId)) allLatestByLead.set(a.leadId, a.createdAt);
    }
    adminNegotiationsNeedingAttention = allActive
      .map((n) => ({
        leadId: n.leadId,
        customerName: leadsMap.get(n.leadId)?.name || "",
        projectName: (n.projectId && (projectToTitle[n.projectId] || n.projectId)) || "",
        smName: usersMap.get(n.assignedSmId) || "",
        health: dealHealthFor(lastActiveFor(n, n.leadId, allLatestByLead)),
      }))
      .filter((n) => n.health.level !== "healthy")
      .sort((a, b) => b.health.days - a.health.days);

    const allDoneVisits = db
      .select()
      .from(schema.siteVisits)
      .where(eq(schema.siteVisits.status, "visit_done"))
      .all();
    for (const v of allDoneVisits) {
      if (db.select().from(schema.postVisitFeedback).where(eq(schema.postVisitFeedback.visitId, v.id)).get()) {
        continue;
      }
      const doneMs = new Date(v.doneAt || v.createdAt).getTime();
      if (doneMs && elapsedSinceMs(doneMs) >= threeHoursMs) {
        adminFeedbackPending.push({
          visitId: v.id,
          leadId: v.leadId,
          customerName: leadsMap.get(v.leadId)?.name || "",
          projectName: (v.projectId && (projectToTitle[v.projectId] || v.projectId)) || "",
          smName: usersMap.get(v.smId) || "",
          link: `/crm/leads/${v.leadId}/negotiation?feedback=${v.id}`,
        });
      }
    }

    for (const v of db.select().from(schema.siteVisits).all()) {
      if (!needsTagging(v)) continue;
      adminTaggingPending.push({
        visitId: v.id,
        leadId: v.leadId,
        customerName: leadsMap.get(v.leadId)?.name || "",
        projectName: (v.projectId && (projectToTitle[v.projectId] || v.projectId)) || "",
        smName: usersMap.get(v.smId) || "",
        status: v.status,
        overdue: v.status !== "visit_done",
        link: `/crm/leads/${v.leadId}?visit=1`,
      });
    }
  }

// ---- Price validity expiring ----
  const expiringProjects = projects.filter((p) => {
    const pv = priceValidityInfo(p);
    return pv && pv.daysLeft >=0 && pv.daysLeft <=7;
  });

  const priceExpiringLeads: {
    projectTitle: string;
    projectSlug: string;
    leadId: number;
    customerName: string;
    status: string;
  }[] = [];

  if (expiringProjects.length > 0) {
    const excludedStatuses = [...FINAL_STAGES, "invalid", "dnc", "nurture", "lost", "booked"];
    const activeLeads = db.select().from(schema.leads).all().filter((l) => !excludedStatuses.includes(l.status));
    const weights = getMatchingWeights();
    for (const p of expiringProjects) {
      for (const lead of activeLeads) {
        if (isSm && lead.assignedSmId !== user.id) continue;
        const matches = matchProperties({
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
        }, 1, weights);
        if (matches[0]?.projectSlug === p.slug && matches[0].score >= 50) {
          priceExpiringLeads.push({
            projectTitle: p.title,
            projectSlug: p.slug,
            leadId: lead.id,
            customerName: lead.name,
            status: lead.status,
          });
        }
      }
    }
  }

  // ---- Reactivation opportunities ----
  const reactivationAlerts = (isAdmin || isSm)
    ? scanAndFetchReactivationAlerts(isSm ? user.id : undefined)
    : [];

return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-primary sm:text-2xl">
          Welcome, {user.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {isCaller
            ? "Today's command center: priority calls, follow-ups, and performance in one place."
            : isSm
              ? "Today's visits, follow-ups, and hot leads at a glance."
              : "Today's sales performance at a glance."}
        </p>
      </div>

      {/* Caller command center */}
      {isCaller && <CallerDashboard name={user.name} />}

      {/* Owner stats */}
      {isAdmin && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
<StatCard label="Today Leads" value={String(data.todayLeads)} accent />
          <StatCard label="Total Leads" value={String(data.totalLeads)} />
          <StatCard label="Qualified" value={String(data.qualified)} />
          <StatCard label="Visits Booked" value={String(data.visitsBooked)} />
          <StatCard label="Visits Done" value={String(data.visitsDone)} />
          <StatCard label="Bookings" value={String(data.bookings)} />
        </div>
      )}

{/* SM today quick stats */}
      {isSm && smMetrics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="New Assigned" value={String(smMetrics.assigned)} accent />
          <StatCard label="Calls" value={String(smMetrics.calls)} />
          <StatCard label="Connected" value={String(smMetrics.connected)} />
          <StatCard label="Qualified" value={String(smMetrics.qualified)} />
          <StatCard label="Visits Booked" value={String(smMetrics.visitsBooked)} />
          <StatCard label="Visits Done" value={String(smMetrics.visitsCompleted)} />
          <StatCard label="Negotiations" value={String(smMetrics.negotiations)} />
          <StatCard label="Bookings" value={String(smMetrics.bookings)} />
        </div>
      )}

      {/* Today's visits - SM view */}
      {isSm && scheduledVisits.length > 0 && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-primary">Today&apos;s Visits</h2>
            <Badge color="bg-primary/10 text-primary">{scheduledVisits.length}</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {scheduledVisits.map((v) => (
              <div key={v.id} className="flex items-center gap-3 rounded-xl bg-background p-3">
                <div className="shrink-0 text-center">
                  <div className="text-sm font-bold text-primary">{v.time || ""}</div>
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <Link
                    href={`/crm/leads/${v.leadId}`}
                    className="font-semibold text-navy hover:underline"
                  >
                    {v.customerName}
                  </Link>
                  <div className="truncate text-xs text-muted">
                    {v.projectName}
                    {v.meetingPoint ? ` – ${v.meetingPoint}` : ""}
                  </div>
                </div>
                <Badge color="bg-sky-100 text-sky-800">{v.status.replace("_", " ")}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Feedback pending - SM view */}
      {isSm && feedbackPending.length > 0 && (
        <Card className="border-amber-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-amber-800">⚠ Feedback Pending</h2>
            <Badge color="bg-amber-100 text-amber-800">{feedbackPending.length}</Badge>
          </div>
          <div className="space-y-2">
            {feedbackPending.map((f) => (
              <Link
                key={f.visitId}
                href={f.link}
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 transition-colors hover:bg-amber-100/60"
              >
                <div className="min-w-0 text-sm">
                  <div className="truncate font-semibold text-navy">{f.customerName}&apos;s visit</div>
                  <div className="truncate text-xs text-muted">{f.projectName}</div>
                </div>
                <span className="shrink-0 rounded-xl bg-primary px-3 py-1.5 text-[11px] font-bold text-white">
                  SUBMIT
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Property tagging pending - SM view */}
      {isSm && taggingPending.length > 0 && (
        <Card className="border-amber-200 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-bold text-amber-800">⚠ Property Tagging Pending</h2>
            <Badge color="bg-amber-100 text-amber-800">{taggingPending.length}</Badge>
          </div>
          <p className="mb-3 text-xs text-muted">
            Close these visits and tag which properties were shown.
          </p>
          <div className="space-y-2">
            {taggingPending.map((t) => (
              <Link
                key={t.visitId}
                href={t.link}
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 transition-colors hover:bg-amber-100/60"
              >
                <div className="min-w-0 text-sm">
                  <div className="truncate font-semibold text-navy">{t.customerName}&apos;s visit</div>
                  <div className="truncate text-xs text-muted">
                    {t.projectName || "Project TBD"}
                    {t.overdue ? " · visit date passed" : " · tagging incomplete"}
                  </div>
                </div>
                <span className="shrink-0 rounded-xl bg-primary px-3 py-1.5 text-[11px] font-bold text-white">
                  TAG
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Deal health - SM view */}
      {isSm && dealHealthList.length > 0 && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-primary">Deal Health</h2>
            <Link
              href="/crm/leads?status=negotiation"
              className="text-xs font-semibold text-accent-ink hover:underline"
            >
              All negotiations →
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {dealHealthList.map((d) => (
              <Link
                key={d.leadId}
                href={`/crm/leads/${d.leadId}/negotiation`}
                className="flex items-center justify-between gap-3 rounded-xl bg-background p-3 transition-shadow hover:shadow-md"
              >
                <div className="min-w-0 text-sm">
                  <div className="truncate font-semibold text-navy">{d.customerName}</div>
                  <div className="truncate text-xs text-muted">
                    {d.projectName || (NEGOTIATION_STATUS_LABELS[d.status] || d.status)}
                  </div>
                </div>
                <Badge color={d.health.cls} >
                  {d.health.label}
                </Badge>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Needs Attention - owner view */}
      {isAdmin && (
        <section>
          <h2 className="mb-3 text-base font-bold text-primary">Needs Attention</h2>
          {adminNegotiationsNeedingAttention.length === 0 &&
          adminFeedbackPending.length === 0 &&
          adminTaggingPending.length === 0 ? (
            <p className="text-xs text-muted">Everything is on track. No pending deals or feedback.</p>
          ) : (
            <>
              {adminNegotiationsNeedingAttention.length > 0 && (
                <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {adminNegotiationsNeedingAttention.slice(0, 6).map((n) => (
                    <Link
                      key={n.leadId}
                      href={`/crm/leads/${n.leadId}/negotiation`}
                      className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-white p-3 transition-shadow hover:shadow-md"
                    >
                      <div className="min-w-0 text-sm">
                        <div className="truncate font-bold text-navy">{n.customerName}</div>
                        <div className="truncate text-xs text-muted">
                          {n.projectName} – SM: {n.smName}
                        </div>
                      </div>
                      <Badge color={n.health.cls} >
                        {n.health.label}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
              {adminFeedbackPending.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-amber-800">
                      ⚠ Feedback Pending ({adminFeedbackPending.length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {adminFeedbackPending.slice(0, 5).map((f) => (
                      <Link
                        key={f.visitId}
                        href={f.link}
                        className="flex items-center justify-between gap-3 rounded-xl bg-white p-3"
                      >
                        <div className="min-w-0 text-sm">
                          <div className="truncate font-semibold text-navy">{f.customerName}</div>
                          <div className="truncate text-xs text-muted">
                            {f.projectName} – SM: {f.smName}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-xl bg-primary px-3 py-1 text-[11px] font-bold text-white">
                          SUBMIT
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {adminTaggingPending.length > 0 && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-amber-800">
                      ⚠ Property Tagging Pending ({adminTaggingPending.length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {adminTaggingPending.slice(0, 5).map((t) => (
                      <Link
                        key={t.visitId}
                        href={t.link}
                        className="flex items-center justify-between gap-3 rounded-xl bg-white p-3"
                      >
                        <div className="min-w-0 text-sm">
                          <div className="truncate font-semibold text-navy">{t.customerName}</div>
                          <div className="truncate text-xs text-muted">
                            {t.projectName || "Project TBD"} – SM: {t.smName}
                            {t.overdue ? " · visit date passed" : " · tagging incomplete"}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-xl bg-primary px-3 py-1 text-[11px] font-bold text-white">
                          TAG
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Team performance - Owner view */}
      {isAdmin && (
        <>
<section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-primary">
                Sales Manager Performance
              </h2>
              <Link
                href="/crm/reports"
                className="text-xs font-semibold text-accent-ink hover:underline"
              >
                Team Daily Report →
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.salesManagers.map((sm) => (
                <Card key={sm.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-navy">{sm.name}</div>
                    <Badge
                      color={
                        sm.leadToBooking >= 5
                          ? "bg-green-100 text-green-800"
                          : sm.leadToBooking >= 3
                            ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-700"
                      }
                    >
                      {sm.leadToBooking}% L→B
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <MiniStat label="Leads" value={String(sm.leads)} />
                    <MiniStat label="Visits" value={String(sm.visitsCompleted)} />
                    <MiniStat label="Bookings" value={String(sm.bookings)} />
                  </div>
                  <div className="mt-3 text-[11px] text-muted">
                    Overdue follow-ups:{" "}
                    <span className="font-semibold text-red-600">
                      {sm.overdue}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-base font-bold text-primary">
              Caller Performance
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.callers.map((caller) => (
                <Card key={caller.id} className="p-4">
                  <div className="text-sm font-bold text-navy">{caller.name}</div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <MiniStat label="Leads" value={String(caller.leads)} />
                    <MiniStat
                      label="Contact %"
                      value={`${caller.contactRate}%`}
                    />
                    <MiniStat
                      label="Qualified"
                      value={String(caller.qualified)}
                    />
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </>
      )}

{/* Price validity expiring leads */}
      {(isAdmin || isSm) && priceExpiringLeads.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-bold text-primary">⏰ Price Validity Expiring</h2>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            {priceExpiringLeads.map((item) => {
              const pv = priceValidityInfo(expiringProjects.find((p)=> p.slug === item.projectSlug) || {});
              return (
                <div key={`${item.projectSlug}-${item.leadId}`} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3">
                  <div className="min-w-0 text-sm">
                    <div className="truncate font-semibold text-navy">
                      <Link href={`/crm/leads/${item.leadId}`} className="hover:underline">{item.customerName}</Link>
                    </div>
                    <div className="truncate text-xs text-muted">
                      {item.projectTitle} · {pv?.label || "Price expiring soon"}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    {pv?.daysLeft ?? "?"} day{(pv?.daysLeft ?? 0) === 1 ? "" : "s"} left
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Reactivation Opportunities */}
      {(isAdmin || isSm) && reactivationAlerts.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-bold text-primary">🔄 Reactivation Opportunities</h2>
          <div className="space-y-3">
            {Object.entries(
              reactivationAlerts.reduce((acc: Record<string, typeof reactivationAlerts>, a) => {
                (acc[a.projectSlug] = acc[a.projectSlug] || []).push(a);
                return acc;
              }, {})
            ).map(([slug, alerts]) => (
              <div key={slug} className="rounded-2xl border border-border bg-white p-4">
                <p className="text-xs font-bold text-navy">
                  New project &apos;{alerts[0].projectTitle}&apos; matches{" "}
                  {alerts.length} old lead{alerts.length === 1 ? "" : "s"} who
                  didn&apos;t convert before. Worth a re-approach?
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {alerts.map((a) => (
                    <Link
                      key={a.leadId}
                      href={`/crm/leads/${a.leadId}`}
                      className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-semibold text-navy hover:bg-primary/5"
                    >
                      {a.leadName}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Caller full-inbox shortcut */}
      {isCaller && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-primary">Your Inbox</h2>
            <Link href="/crm/leads" className="text-xs font-semibold text-primary hover:underline">
              Full inbox & call center →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ActionCard href="/crm/leads" label="Lead Inbox" />
            <ActionCard href="/crm/reports" label="Daily Report" />
            <ActionCard href="/crm/leaderboard" label="Leaderboard" />
            <ActionCard href="/crm/leads" label="Call Center" />
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        accent
          ? "border-primary bg-primary"
          : "border-border bg-white"
      }`}
    >
      <div
        className={`text-sm font-bold ${
          accent ? "text-white" : "text-navy"
        }`}
      >
        {value}
      </div>
      <div
        className={`mt-0.5 text-[11px] ${
          accent ? "text-white/70" : "text-muted"
        }`}
      >
        {label}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background px-1 py-1.5">
      <div className="text-sm font-bold text-primary">{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}

function ActionCard({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-white p-4 text-center transition-colors hover:border-primary/30 hover:bg-primary/5"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-primary">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
      <span className="text-xs font-semibold text-navy">{label}</span>
    </Link>
  );
}

