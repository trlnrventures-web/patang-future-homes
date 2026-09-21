import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import {
  readProjectsFile,
  writeProjectsFile,
  slugifyTitle,
  type ProjectRecord,
} from "@/lib/crm/projects-store";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { slug } = await params;
  const project = readProjectsFile().find((p) => p.slug === slug);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { slug } = await params;
    const body: Record<string, unknown> = await request.json();
    const projects = readProjectsFile();
    const idx = projects.findIndex((p) => p.slug === slug);
    if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const current = projects[idx];

    // Slug change
    let newSlug = current.slug;
    if (body.slug && String(body.slug).trim() !== current.slug) {
      newSlug = slugifyTitle(String(body.slug).trim());
      if (projects.some((p) => p.slug === newSlug && p.slug !== current.slug)) {
        return NextResponse.json({ error: `Slug "${newSlug}" already exists` }, { status: 409 });
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

    if (body.amenities && typeof body.amenities === "object") merged.amenities = body.amenities;
    if (body.developer && typeof body.developer === "object") merged.developer = body.developer;
    if (body.isActive !== undefined) merged.isActive = body.isActive === true || body.isActive === "true";

    merged.slug = newSlug;
    projects[idx] = merged as ProjectRecord;
    writeProjectsFile(projects);
    return NextResponse.json({ project: { slug: newSlug, title: merged.title } });
  } catch (error) {
    console.error("Update property error:", error);
    return NextResponse.json({ error: "Failed to update property" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { slug } = await params;
  const projects = readProjectsFile();
  const idx = projects.findIndex((p) => p.slug === slug);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  projects.splice(idx, 1);
  writeProjectsFile(projects);
  return NextResponse.json({ ok: true });
}