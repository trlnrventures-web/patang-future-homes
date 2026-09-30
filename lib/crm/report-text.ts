export type ReportTextMetrics = {
  newLeads?: number;
  assigned?: number;
  calls: number;
  connected: number;
  qualified: number;
  followUpsCompleted: number;
  noResponse?: number;
  visitsBooked?: number;
  visitsCompleted?: number;
  negotiations?: number;
  bookings?: number;
  talkSeconds?: number;
  timedCalls?: number;
  avgTalkSeconds?: number;
  connectRatePct?: number;
  inboundCalls?: number;
  missedCalls?: number;
};

/** "1h 24m" / "8m 30s" / "45s", for the plain-text export. */
export function humanDuration(seconds: number | undefined): string {
  const total = Math.max(0, Math.floor(seconds ?? 0));
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${total % 60}s`;
}

/**
 * Call-time lines, appended only when the day actually has a timed attempt.
 * Printing "Total talk time: 0s" on every report would read as a broken
 * metric on a day where nobody had a measurable call.
 */
function callTimeLines(metrics: ReportTextMetrics, indent = ""): string[] {
  if (!metrics.timedCalls) return [];
  return [
    `${indent}Talk Time: ${humanDuration(metrics.talkSeconds)}`,
    `${indent}Avg Call: ${humanDuration(metrics.avgTalkSeconds)}`,
    `${indent}Connect Rate: ${metrics.connectRatePct ?? 0}%`,
  ];
}

export function formatReportDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function reportLine(label: string, value?: number): string {
  return `${label}: ${value ?? 0}`;
}

export function buildMyReportText(opts: {
  date: string;
  employeeName: string;
  role: string;
  metrics: ReportTextMetrics;
}): string {
  const { date, employeeName, role, metrics } = opts;
  const lines = [
    "PATANG FUTURE HOMES DAILY REPORT",
    "",
    `Date: ${formatReportDate(date)}`,
    `Employee: ${employeeName}`,
    "",
  ];

  if (role === "caller") {
    lines.push(
      reportLine("New Leads", metrics.newLeads),
      reportLine("Calls Made", metrics.calls),
      reportLine("Connected", metrics.connected),
      ...callTimeLines(metrics),
      reportLine("Incoming Calls", metrics.inboundCalls),
      reportLine("Missed Calls", metrics.missedCalls),
      reportLine("Qualified", metrics.qualified),
      reportLine("Assigned to SM", metrics.assigned),
      reportLine("No Response", metrics.noResponse),
      reportLine("Follow-ups Completed", metrics.followUpsCompleted)
    );
  } else {
    lines.push(
      reportLine("New Leads Assigned", metrics.assigned),
      reportLine("Calls Made", metrics.calls),
      reportLine("Connected", metrics.connected),
      ...callTimeLines(metrics),
      reportLine("Qualified", metrics.qualified),
      reportLine("Follow-ups Completed", metrics.followUpsCompleted),
      reportLine("Visits Booked", metrics.visitsBooked),
      reportLine("Visits Completed", metrics.visitsCompleted),
      reportLine("Negotiations", metrics.negotiations),
      reportLine("Bookings", metrics.bookings)
    );
  }

  return lines.join("\n");
}

export function buildTeamReportText(opts: {
  date: string;
  totals: ReportTextMetrics;
  callers: { name: string; metrics: ReportTextMetrics }[];
  salesManagers: { name: string; metrics: ReportTextMetrics }[];
}): string {
  const { date, totals, callers, salesManagers } = opts;
  const lines = [
    "PATANG FUTURE HOMES TEAM DAILY REPORT",
    "",
    `Date: ${formatReportDate(date)}`,
    "",
    "OVERALL",
    reportLine("Total Leads", totals.newLeads),
    reportLine("Total Calls", totals.calls),
    reportLine("Connected", totals.connected),
    ...callTimeLines(totals),
    reportLine("Incoming Calls", totals.inboundCalls),
    reportLine("Missed Calls", totals.missedCalls),
    reportLine("Qualified", totals.qualified),
    reportLine("Visits Booked", totals.visitsBooked),
    reportLine("Visits Completed", totals.visitsCompleted),
    reportLine("Negotiations", totals.negotiations),
    reportLine("Bookings", totals.bookings),
  ];

  if (callers.length > 0) {
    lines.push("", "CALLER");
    for (const c of callers) {
      lines.push(
        `${c.name}`,
        reportLine("  Leads", c.metrics.newLeads),
        reportLine("  Calls", c.metrics.calls),
        reportLine("  Connected", c.metrics.connected),
        ...callTimeLines(c.metrics, "  "),
        reportLine("  Qualified", c.metrics.qualified),
        reportLine("  Assigned", c.metrics.assigned)
      );
    }
  }

  if (salesManagers.length > 0) {
    lines.push("", "SALES");
    for (const s of salesManagers) {
      lines.push(
        `${s.name}`,
        reportLine("  Assigned", s.metrics.assigned),
        reportLine("  Calls", s.metrics.calls),
        ...callTimeLines(s.metrics, "  "),
        reportLine("  Visits Booked", s.metrics.visitsBooked),
        reportLine("  Visits Completed", s.metrics.visitsCompleted),
        reportLine("  Negotiations", s.metrics.negotiations),
        reportLine("  Bookings", s.metrics.bookings)
      );
    }
  }

  return lines.join("\n");
}