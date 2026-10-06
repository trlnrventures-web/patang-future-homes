import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { handleReInquiry } from "@/lib/crm/reinquiry";
import { notifyUser } from "@/lib/crm/push";

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || "";
const APP_SECRET = process.env.META_APP_SECRET || "";
const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN || "";

const GRAPH_BASE = "https://graph.facebook.com/v20.0";

function getNow() {
  return new Date().toISOString();
}

function logIntegration({
  provider,
  webhookType,
  status,
  leadgenId,
  formId,
  pageId,
  leadId,
  message,
  rawPayload,
}: {
  provider: string;
  webhookType?: string | null;
  status: "received" | "processed" | "duplicate_matched" | "reactivated" | "failed";
  leadgenId?: string | null;
  formId?: string | null;
  pageId?: string | null;
  leadId?: number | null;
  message?: string | null;
  rawPayload?: string | null;
}) {
  try {
    const db = getDb();
    db.insert(schema.integrationLogs)
      .values({
        provider,
        webhookType: webhookType ?? null,
        status,
        leadgenId: leadgenId ?? null,
        formId: formId ?? null,
        pageId: pageId ?? null,
        leadId: leadId ?? null,
        message: message ?? null,
        rawPayload: rawPayload ?? null,
        createdAt: getNow(),
      })
      .run();
  } catch (err) {
    console.error("[meta-leads-webhook] failed to write integration log:", err);
  }
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!APP_SECRET || !signatureHeader) return false;
  if (!signatureHeader.startsWith("sha256=")) return false;
  const signature = signatureHeader.substring("sha256=".length);
  const computed = createHmac("sha256", APP_SECRET).update(rawBody).digest("hex");
  const expected = Buffer.from(computed, "utf8");
  const provided = Buffer.from(signature, "utf8");
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

type WebhookEntry = {
  id?: string;
  time?: number;
  changes?: Array<{
    field?: string;
    value?: unknown;
    values?: Record<string, unknown>[];
  }>;
};

type WebhookBody = {
  object?: string;
  entry?: WebhookEntry[];
};

type LeadgenDetails = {
  id: string;
  created_time?: string;
  field_data?: Array<{ name: string; values?: Array<{ value?: string }> }>;
  form_id?: string;
  page_id?: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
};

function notifyCaller(leadId: number, name: string): void {
  try {
    const db = getDb();
    const callers = db
      .select()
      .from(schema.users)
      .all()
      .filter((u) => u.role === "caller" || u.role === "admin" || u.role === "marketing");
    for (const c of callers) {
      notifyUser(c.id, {
        title: "New Meta lead",
        body: `${name || "New enquiry"} - Meta Lead Ad`,
        url: `/crm/leads/${leadId}`,
        tag: `meta-lead-${leadId}`,
      }).catch(() => {});
    }
  } catch (err) {
    console.warn("[meta-leads-webhook] notifyCaller failed:", err);
  }
}

async function fetchLeadDetails(leadgenId: string): Promise<LeadgenDetails> {
  if (!PAGE_ACCESS_TOKEN) {
    throw new Error("META_PAGE_ACCESS_TOKEN not configured");
  }
  const url = `${GRAPH_BASE}/${encodeURIComponent(leadgenId)}?access_token=${encodeURIComponent(PAGE_ACCESS_TOKEN)}&fields=id,created_time,field_data,form_id,page_id,ad_id,adset_id,campaign_id`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph API request failed (${res.status}): ${text}`);
  }
  const data = (await res.json().catch(() => ({}))) as LeadgenDetails;
  return data;
}

function extractLeadFields(fieldData: LeadgenDetails["field_data"] = []): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const item of fieldData) {
    const name = item.name;
    if (!name) continue;
    const value = item.values?.[0]?.value;
    if (value != null) {
      fields[name] = String(value);
    }
  }
  return fields;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === VERIFY_TOKEN) {
    return new NextResponse(challenge || "", { status: 200 });
  }
  return NextResponse.json({ error: "Invalid verification" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  logIntegration({
    provider: "meta",
    webhookType: "leadgen",
    status: "received",
    rawPayload: rawBody,
  });

  if (!verifySignature(rawBody, signature)) {
    logIntegration({
      provider: "meta",
      webhookType: "leadgen",
      status: "failed",
      message: "Invalid signature",
      rawPayload: rawBody,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    logIntegration({
      provider: "meta",
      webhookType: "leadgen",
      status: "failed",
      message: "Invalid JSON",
      rawPayload: rawBody,
    });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.object !== "page") {
    logIntegration({
      provider: "meta",
      webhookType: "leadgen",
      status: "failed",
      message: `Unexpected object: ${body.object}`,
      rawPayload: rawBody,
    });
    return NextResponse.json({ error: "Unsupported object" }, { status: 400 });
  }

  const entries = body.entry || [];
  const db = getDb();
  const now = getNow();

  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      if (change.field !== "leadgen") continue;
      const leadgenIdRaw = typeof change.value === "string" ? change.value : (change.value as any)?.leadgen_id;
      const leadgenId = leadgenIdRaw ? String(leadgenIdRaw) : null;

      if (!leadgenId) continue;

      let leadDetails: LeadgenDetails;
      try {
        leadDetails = await fetchLeadDetails(leadgenId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logIntegration({
          provider: "meta",
          webhookType: "leadgen",
          status: "failed",
          leadgenId,
          message: `Failed to fetch lead details: ${msg}`,
          rawPayload: rawBody,
        });
        return NextResponse.json({ error: "Failed to fetch lead details" }, { status: 500 });
      }

      const fields = extractLeadFields(leadDetails.field_data);
      const phone = fields.phone_number || fields.phone || fields.Phone || "";
      const email = fields.email || fields.Email || "";
      const fullName = fields.full_name || fields.name || fields.FullName || "";

      const phoneForMatch = phone || (email ? `${email}@no-phone` : "");
      if (!fullName || !phoneForMatch) {
        logIntegration({
          provider: "meta",
          webhookType: "leadgen",
          status: "failed",
          leadgenId,
          formId: leadDetails.form_id || null,
          pageId: leadDetails.page_id || null,
          message: "Missing name or phone/email",
          rawPayload: rawBody,
        });
        continue;
      }

      try {
        const result = handleReInquiry({
          db,
          phone: phoneForMatch,
          source: "meta",
          message: JSON.stringify(fields),
          insertLead: () =>
            db
              .insert(schema.leads)
              .values({
                name: fullName,
                phone: phoneForMatch,
                whatsappNumber: phoneForMatch,
                email: email || null,
                source: "meta",
                formName: leadDetails.form_id ? `Meta Form ${leadDetails.form_id}` : "Meta Lead Ad",
                campaignId: leadDetails.campaign_id ? String(leadDetails.campaign_id) : null,
                adSetId: leadDetails.adset_id ? String(leadDetails.adset_id) : null,
                adId: leadDetails.ad_id ? String(leadDetails.ad_id) : null,
                campaignName: leadDetails.campaign_id ? String(leadDetails.campaign_id) : null,
                adSetName: leadDetails.adset_id ? String(leadDetails.adset_id) : null,
                adName: leadDetails.ad_id ? String(leadDetails.ad_id) : null,
                originalMessage: JSON.stringify(fields),
                notes: `Meta Lead Ad webhook. Form: ${leadDetails.form_id || "n/a"}, Page: ${leadDetails.page_id || "n/a"}, Ad: ${leadDetails.ad_id || "n/a"}, AdSet: ${leadDetails.adset_id || "n/a"}, Campaign: ${leadDetails.campaign_id || "n/a"}`,
                status: "new",
                stageChangedAt: now,
                createdAt: now,
                updatedAt: now,
              })
              .returning()
              .get(),
        });

        const leadRow = result.lead;

        if (result.kind === "new") {
          db.insert(schema.activities)
            .values({
              leadId: leadRow.id,
              userId: leadRow.assignedCallerId || 1,
              type: "note",
              notes: "Lead created from Meta Lead Ads webhook",
              createdAt: now,
            })
            .run();
          logIntegration({
            provider: "meta",
            webhookType: "leadgen",
            status: "processed",
            leadgenId,
            formId: leadDetails.form_id || null,
            pageId: leadDetails.page_id || null,
            leadId: leadRow.id,
            message: "New lead created",
          });
          notifyCaller(leadRow.id, fullName);
        } else if (result.kind === "duplicate") {
          logIntegration({
            provider: "meta",
            webhookType: "leadgen",
            status: "duplicate_matched",
            leadgenId,
            formId: leadDetails.form_id || null,
            pageId: leadDetails.page_id || null,
            leadId: leadRow.id,
            message: `Duplicate match (status: ${result.status})`,
          });
        } else if (result.kind === "reactivated") {
          logIntegration({
            provider: "meta",
            webhookType: "leadgen",
            status: "reactivated",
            leadgenId,
            formId: leadDetails.form_id || null,
            pageId: leadDetails.page_id || null,
            leadId: leadRow.id,
            message: `Reactivated from ${result.fromStatus}`,
          });
          notifyCaller(leadRow.id, fullName);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logIntegration({
          provider: "meta",
          webhookType: "leadgen",
          status: "failed",
          leadgenId,
          formId: leadDetails.form_id || null,
          pageId: leadDetails.page_id || null,
          message: msg,
          rawPayload: rawBody,
        });
        return NextResponse.json({ error: "Processing failed" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}