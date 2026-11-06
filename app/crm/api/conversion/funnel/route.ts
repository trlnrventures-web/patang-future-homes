import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { getConversionFunnel, istToday } from "@/lib/crm/reports";
import { projects } from "@/lib/projects";

export const dynamic = "force-dynamic";

function daysBefore(date: string, days: number): string {
  const ms = new Date(`${date}T00:00:00+05:30`).getTime() - days * 24 * 60 * 60 * 1000;
  return new Date(ms + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * The Vasai West conversion funnel behind the reports card. Admin / Sales Head
 * only, because it breaks performance down per caller and per sales manager.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const today = istToday();
  const to = request.nextUrl.searchParams.get("to") || today;
  const from = request.nextUrl.searchParams.get("from") || daysBefore(to, 30);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const lookup = new Map(projects.map((p) => [p.slug, p.title]));
  return NextResponse.json(getConversionFunnel(from, to, lookup));
}
