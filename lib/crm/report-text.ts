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
};

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
    "PATANG FUTURE HOMES — DAILY REPORT",
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
    "PATANG FUTURE HOMES — TEAM DAILY REPORT",
    "",
    `Date: ${formatReportDate(date)}`,
    "",
    "OVERALL",
    reportLine("Total Leads", totals.newLeads),
    reportLine("Total Calls", totals.calls),
    reportLine("Connected", totals.connected),
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
        reportLine("  Visits Booked", s.metrics.visitsBooked),
        reportLine("  Visits Completed", s.metrics.visitsCompleted),
        reportLine("  Negotiations", s.metrics.negotiations),
        reportLine("  Bookings", s.metrics.bookings)
      );
    }
  }

  return lines.join("\n");
}