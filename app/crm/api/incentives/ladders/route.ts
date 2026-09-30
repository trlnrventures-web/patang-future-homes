import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import {
  DEFAULT_INCENTIVE_LADDERS,
  LADDER_KEYS,
  getIncentiveLadders,
  saveIncentiveLadders,
  type IncentiveLadder,
  type LadderKey,
} from "@/lib/crm/incentives";

export const dynamic = "force-dynamic";

/** Admin/owner only. Staff have no reason to read or change the rate card. */
export async function GET() {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    ladders: getIncentiveLadders(),
    defaults: DEFAULT_INCENTIVE_LADDERS,
  });
}

/**
 * Replace the rate card.
 *
 * `parseLadder` does the real validation - it drops tiers with a non-integer
 * threshold or a negative rate, de-duplicates thresholds, and falls back to the
 * shipped default for a role that came back with nothing usable. The only thing
 * checked here is the shape, so a malformed body fails with a 400 rather than
 * being silently half-applied.
 */
export async function PUT(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const incoming = (body?.ladders ?? body) as Record<string, unknown>;

    const next = {} as Record<LadderKey, IncentiveLadder>;
    for (const key of LADDER_KEYS) {
      const raw = incoming?.[key];
      if (!raw || typeof raw !== "object") {
        return NextResponse.json(
          { error: `Missing ladder for ${key}` },
          { status: 400 }
        );
      }
      if (!Array.isArray((raw as IncentiveLadder).tiers)) {
        return NextResponse.json(
          { error: `Tiers must be a list for ${key}` },
          { status: 400 }
        );
      }
      next[key] = {
        key,
        label: (raw as IncentiveLadder).label || DEFAULT_INCENTIVE_LADDERS[key].label,
        capped: (raw as IncentiveLadder).capped !== false,
        tiers: (raw as IncentiveLadder).tiers,
      };
    }

    const saved = saveIncentiveLadders(next, user.id);
    return NextResponse.json({ ok: true, ladders: saved });
  } catch (error) {
    console.error("Incentive ladders PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update incentive rates" },
      { status: 500 }
    );
  }
}
