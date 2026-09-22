import { NextRequest, NextResponse } from "next/server";
import { canManageProperties } from "@/lib/crm/auth";
import { getCurrentUser } from "@/lib/crm/data";
import { logPropertyHttp } from "@/lib/crm/api";
import {
  readProjectsFile,
  writeProjectsFile,
  slugifyTitle,
  type ProjectRecord,
} from "@/lib/crm/projects-store";
import { amenityKeys } from "@/lib/amenities";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    logPropertyHttp(request, null, res.status, { error: "Unauthorized" });
    return res;
  }
  if (!canManageProperties(user)) {
    const res = NextResponse.json({ error: "Forbidden" }, { status: 403 });
    logPropertyHttp(request, user, res.status, { error: "Forbidden" });
    return res;
  }

  const { slug } = await params;
  const project = readProjectsFile().find((p) => p.slug === slug);
  if (!project) {
    const res = NextResponse.json({ error: "Not found" }, { status: 404 });
    logPropertyHttp(request, user, res.status, { error: "Not found" });
    return res;
  }
  const res = NextResponse.json({ project });
  logPropertyHttp(request, user, res.status, { project });
  return res;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    logPropertyHttp(request, null, res.status, { error: "Unauthorized" });
    return res;
  }
  if (!canManageProperties(user)) {
    const res = NextResponse.json({ error: "Forbidden" }, { status: 403 });
    logPropertyHttp(request, user, res.status, { error: "Forbidden" });
    return res;
  }

  try {
    const { slug } = await params;
    const body: Record<string, unknown> = await request.json();
    const projects = readProjectsFile();
    const idx = projects.findIndex((p) => p.slug === slug);
    if (idx === -1) {
      const res = NextResponse.json({ error: "Not found" }, { status: 404 });
      logPropertyHttp(request, user, res.status, { error: "Not found" });
      return res;
    }

    const current = projects[idx];

    // Slug change
    let newSlug = current.slug;
    if (body.slug && String(body.slug).trim() !== current.slug) {
      newSlug = slugifyTitle(String(body.slug).trim());
      if (projects.some((p) => p.slug === newSlug && p.slug !== current.slug)) {
        const res = NextResponse.json({ error: `Slug "${newSlug}" already exists` }, { status: 409 });
        logPropertyHttp(request, user, res.status, { error: `Slug "${newSlug}" already exists` });
        return res;
      }
    }

    const merged: Record<string, unknown> = { ...current };
    const textFields = [
      "title", "category", "tier", "location", "area", "type", "status",
      "priceRange", "pricePerSqft", "shortDescription", "description",
      "fullDescription", "reraId", "possessionDate", "landParcel",
      "subLocation", "metaTitle", "metaDescription", "showFlatVideoUrl",
      "walkthroughVideoUrl", "priceValidUntil",
    ];
    for (const k of textFields) {
      if (body[k] !== undefined) {
        merged[k] = body[k] === "" ? undefined : body[k];
      }
    }

    const numFields = ["totalTowers"];
    for (const k of numFields) {
      if (body[k] !== undefined) {
        const n = Number(body[k]);
        merged[k] = Number.isFinite(n) ? n : current[k];
      }
    }

    const listFields = ["usps", "images", "configurations", "nearbyLandmarks", "amenityImages", "showFlatImages"];
    for (const k of listFields) {
      if (Array.isArray(body[k])) merged[k] = body[k];
    }

    if (body.amenities !== undefined) {
      const raw = body.amenities;
      const labels: string[] = Array.isArray(raw)
        ? []
        : Object.values(raw as Record<string, unknown>).flatMap(
            (v) => (Array.isArray(v) ? (v as string[]) : [])
          );
      merged.amenities = amenityKeys(raw, labels);
    }
    if (body.developer && typeof body.developer === "object") merged.developer = body.developer;
    if (body.isActive !== undefined) merged.isActive = body.isActive === true || body.isActive === "true";

    merged.slug = newSlug;
    projects[idx] = merged as ProjectRecord;
    writeProjectsFile(projects);
    const res = NextResponse.json({ project: { slug: newSlug, title: merged.title } });
    logPropertyHttp(request, user, res.status, { project: { slug: newSlug, title: merged.title } });
    return res;
  } catch (error) {
    console.error("Update property error:", error);
    const res = NextResponse.json({ error: "Failed to update property" }, { status: 500 });
    logPropertyHttp(request, user, res.status, { error: "Failed to update property" });
    return res;
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    logPropertyHttp(request, null, res.status, { error: "Unauthorized" });
    return res;
  }
  if (!canManageProperties(user)) {
    const res = NextResponse.json({ error: "Forbidden" }, { status: 403 });
    logPropertyHttp(request, user, res.status, { error: "Forbidden" });
    return res;
  }

  const { slug } = await params;
  const projects = readProjectsFile();
  const idx = projects.findIndex((p) => p.slug === slug);
  if (idx === -1) {
    const res = NextResponse.json({ error: "Not found" }, { status: 404 });
    logPropertyHttp(request, user, res.status, { error: "Not found" });
    return res;
  }

  projects.splice(idx, 1);
  writeProjectsFile(projects);
  const res = NextResponse.json({ ok: true });
  logPropertyHttp(request, user, res.status, { ok: true });
  return res;
}