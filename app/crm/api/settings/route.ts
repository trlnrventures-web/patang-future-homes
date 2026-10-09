import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { getSetting, updateSetting } from "@/lib/crm/settings";
import { BUDGET_RANGE_DEFS, DEFAULT_BUDGET_RANGE_KEYS } from "@/lib/crm/budget";

const PUBLIC_KEYS = ["sla_first_response_min"];

/** Steps of the no-response ladder, in order. */
const NO_RESPONSE_STEPS = [1, 2, 3, 4, 5];

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const rows = db.select().from(schema.crmSettings).all();
  const settings: Record<string, string> = {};
  for (const r of rows) {
    if (isAdmin(user) || PUBLIC_KEYS.includes(r.key)) settings[r.key] = r.value;
  }

  return NextResponse.json({ settings });
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const updated: Record<string, string> = {};

    if (body.sla_first_response_min != null) {
      const v = parseInt(String(body.sla_first_response_min), 10);
      if (!Number.isFinite(v) || v < 1 || v > 120) {
        return NextResponse.json({ error: "SLA must be between 1 and 120 minutes" }, { status: 400 });
      }
      updateSetting("sla_first_response_min", String(v));
      updated.sla_first_response_min = String(v);
    }

    if (body.matching_weights != null && typeof body.matching_weights === "object") {
      const weights = body.matching_weights;
      const total = Object.values(weights).reduce((a: number, b) => a + (Number(b) || 0), 0);
      if (total > 100) {
        return NextResponse.json({ error: "Matching weights must sum to ≤ 100" }, { status: 400 });
      }
      updateSetting("matching_weights", JSON.stringify(weights));
      updated.matching_weights = JSON.stringify(weights);
    }

    if (body.budget_ranges != null) {
      if (!Array.isArray(body.budget_ranges)) {
        return NextResponse.json({ error: "Budget ranges must be a list" }, { status: 400 });
      }
      const keys = body.budget_ranges.filter(
        (k: unknown): k is string => typeof k === "string" && k in BUDGET_RANGE_DEFS
      );
      if (keys.length === 0) {
        return NextResponse.json(
          { error: `Pick at least one range (from ${DEFAULT_BUDGET_RANGE_KEYS.join(", ")})` },
          { status: 400 }
        );
      }
      const value = JSON.stringify([...new Set(keys)]);
      updateSetting("budget_ranges", value);
      updated.budget_ranges = value;
    }

    if (body.no_response_schedule != null) {
      if (typeof body.no_response_schedule !== "object" || body.no_response_schedule === null) {
        return NextResponse.json({ error: "No-response schedule must be an object" }, { status: 400 });
      }
      const raw = body.no_response_schedule as Record<string, unknown>;
      const schedule: Record<string, number> = {};
      for (const step of NO_RESPONSE_STEPS) {
        const mins = Number(raw[step] ?? raw[String(step)]);
        if (!Number.isFinite(mins) || mins < 0) {
          return NextResponse.json(
            { error: `Attempt ${step} must be a number of minutes (0 or more)` },
            { status: 400 }
          );
        }
        schedule[step] = Math.round(mins);
      }
      const value = JSON.stringify(schedule);
      updateSetting("no_response_schedule", value);
      updated.no_response_schedule = value;
    }

    if (Object.keys(updated).length === 0) {
      return NextResponse.json({ error: "No valid settings provided" }, { status: 400 });
    }

    const settings: Record<string, string> = {};
    for (const key of Object.keys(updated)) {
      settings[key] = getSetting(key);
    }

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Update settings error:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}