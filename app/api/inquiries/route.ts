import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq } from "drizzle-orm";
import { resolveDefaultCallerId } from "@/lib/crm/leads";
import { notifyNewLead } from "@/lib/crm/lead-alerts";
import { handleReInquiry } from "@/lib/crm/reinquiry";

export const runtime = "nodejs";

const ALLOWED_HOSTS = ["patangfuturehomes.com", "localhost"];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const hostname = new URL(origin).hostname;
    return ALLOWED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin as string;
  }
  return headers;
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  let p = digits;
  if (p.length === 12 && p.startsWith("91")) p = p.slice(2);
  else if (p.length === 11 && p.startsWith("0")) p = p.slice(1);
  if (p.length < 10 || p.length > 12) return null;
  return p;
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  try {
    const body = await request.json();

    const name = String(body.name || "").trim();
    const phone = normalizePhone(String(body.phone || ""));
    const project = String(body.project || "").trim() || null;
    const theirMessage = String(body.message || "").trim();

    if (name.length < 2) {
      return NextResponse.json({ error: "Name required" }, { status: 400, headers: corsHeaders(origin) });
    }
    if (!phone) {
      return NextResponse.json({ error: "Valid 10-digit phone required" }, { status: 400, headers: corsHeaders(origin) });
    }

    const db = getDb();
    const now = new Date().toISOString();

    const admin = db.select().from(schema.users).where(eq(schema.users.role, "admin")).all()[0] || null;

    const result = handleReInquiry({
      db,
      phone,
      project,
      message: theirMessage,
      source: "website",
      userId: admin?.id ?? null,
      insertLead: () => {
        const callerId = resolveDefaultCallerId(db);
        return db
          .insert(schema.leads)
          .values({
            name,
            phone,
            whatsappNumber: phone,
            source: "website",
            originalProject: project,
            originalMessage: theirMessage ? `${project ? `${project}: ` : ""}${theirMessage}` : project,
            location: null,
            status: "new",
            assignedCallerId: callerId,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();
      },
    });

    const lead = result.lead;

    if (result.kind === "new" && admin) {
      db.insert(schema.activities)
        .values({
          leadId: lead.id,
          userId: admin.id,
          type: "note",
          notes: `Website enquiry${project ? ` for ${project}` : ""}${theirMessage ? `. Message: ${theirMessage}` : ""}`,
          createdAt: now,
        })
        .run();
    }

    if (result.kind === "new" || result.kind === "reactivated") {
      notifyNewLead(lead.assignedCallerId, lead, { kind: result.kind });
    }

    return NextResponse.json(
      { ok: true, leadId: lead.id, duplicate: result.kind === "duplicate", reactivated: result.kind === "reactivated" },
      { status: 201, headers: corsHeaders(origin) }
    );
  } catch (error) {
    console.error("Website enquiry error:", error);
    return NextResponse.json({ error: "Failed to save enquiry" }, { status: 500, headers: corsHeaders(origin) });
  }
}