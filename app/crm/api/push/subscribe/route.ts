import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { getAuthUser } from "@/lib/crm/auth";
import { getPublicVapidKey } from "@/lib/crm/push";

/** The public half of the VAPID pair, which the browser needs to subscribe. */
export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ publicKey: getPublicVapidKey() });
}

/**
 * Registers a browser's push subscription against the signed-in user.
 *
 * The endpoint is the subscription's identity, so re-subscribing the same
 * browser updates the existing row rather than adding a duplicate — otherwise
 * every reinstall would leave the user receiving each alert twice.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
    const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "endpoint and keys required" }, { status: 400 });
    }

    const db = getDb();
    const now = new Date().toISOString();
    db.insert(schema.pushSubscriptions)
      .values({
        userId: user.id,
        endpoint,
        p256dh,
        auth,
        userAgent: request.headers.get("user-agent"),
        // Cleared on re-subscribe: a previously retired endpoint may be live
        // again after the user reinstalls or re-enables notifications.
        disabledAt: null,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: schema.pushSubscriptions.endpoint,
        set: { userId: user.id, p256dh, auth, disabledAt: null, userAgent: request.headers.get("user-agent") },
      })
      .run();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Push subscribe error:", error);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}

/** Opts this browser out. Scoped to the endpoint, not the whole user. */
export async function DELETE(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }

  const db = getDb();
  // Scoped to the caller's own rows: an endpoint is a long opaque string that
  // could be leaked, and matching on it alone would let one user silence
  // another user's alerts.
  db.update(schema.pushSubscriptions)
    .set({ disabledAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.pushSubscriptions.endpoint, endpoint),
        eq(schema.pushSubscriptions.userId, user.id)
      )
    )
    .run();

  return NextResponse.json({ ok: true });
}
