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

export const dynamic = "force-dynamic";

type ConfigRecord = {
  type?: string;
  carpetArea?: string;
  saleableArea?: string;
  price?: string;
  allInclusive?: boolean;
  parkingIncluded?: boolean;
  floorPlanImage?: string;
};

function projectConfigurations(p: ProjectRecord): ConfigRecord[] {
  return Array.isArray(p.configurations) ? (p.configurations as ConfigRecord[]) : [];
}

function projectBhkOptions(p: ProjectRecord): string[] {
  const out = new Set<string>();
  for (const c of projectConfigurations(p)) {
    const m = String(c?.type || "").match(/(\d+)\s*BHK/i);
    if (m) out.add(m[1]);
  }
  return [...out];
}

function mapConfigurations(p: ProjectRecord) {
  return projectConfigurations(p)
    .map((c) => ({
      type: String(c?.type || "").trim(),
      carpetArea: String(c?.carpetArea || "").trim(),
      saleableArea: String(c?.saleableArea || "").trim(),
      price: String(c?.price || "").trim(),
      allInclusive: c?.allInclusive === true,
      parkingIncluded: c?.parkingIncluded === true,
      floorPlanImage: String(c?.floorPlanImage || "").trim(),
    }))
    .filter((c) => c.type || c.price);
}

function projectAmenities(p: ProjectRecord): string[] {
  return Array.isArray(p?.amenities)
    ? (p.amenities as unknown[]).filter((a): a is string => typeof a === "string")
    : [];
}

export async function GET(request: NextRequest) {
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

  const projects = readProjectsFile();
  const body = {
    projects: projects.map((p) => ({
      slug: p.slug,
      title: p.title || "",
      category: p.category === "resale" ? "resale" : "primary",
      location: p.location || "",
      area: p.area || "",
      type: p.type || "",
      status: p.status || "",
      tier: p.tier || "",
      subLocation: p.subLocation || "",
      priceRange: p.priceRange || "",
      pricePerSqft: p.pricePerSqft || "",
      reraId: p.reraId || "",
      possessionDate: p.possessionDate || "",
      shortDescription: p.shortDescription || "",
      isActive: p.isActive !== false,
      bhkOptions: projectBhkOptions(p),
      configurations: mapConfigurations(p),
      amenities: projectAmenities(p),
    })),
  };
  const res = NextResponse.json(body);
  logPropertyHttp(request, user, res.status, body);
  return res;
}

export async function POST(request: NextRequest) {
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
    const body: Record<string, unknown> = await request.json();
    const title = String(body.title || "").trim();
    if (!title) {
      const res = NextResponse.json({ error: "Title is required" }, { status: 400 });
      logPropertyHttp(request, user, res.status, { error: "Title is required" });
      return res;
    }

    const projects = readProjectsFile();
    let slug = String(body.slug || "").trim();
    if (!slug) slug = slugifyTitle(title);
    if (projects.some((p) => p.slug === slug)) {
      const res = NextResponse.json({ error: `Slug "${slug}" already exists` }, { status: 409 });
      logPropertyHttp(request, user, res.status, { error: `Slug "${slug}" already exists` });
      return res;
    }

    const project: ProjectRecord = {
      slug,
      category: body.category === "resale" ? "resale" : "primary",
      tier: body.tier || "affordable",
      title,
      location: body.location || "Vasai West",
      area: body.area || "west",
      type: body.type || "flat",
      status: body.status || "Under Construction",
      priceRange: body.priceRange || "",
      pricePerSqft: body.pricePerSqft || "On request",
      shortDescription: body.shortDescription || "",
      description: body.description || "",
      fullDescription: body.fullDescription || "",
      usps: Array.isArray(body.usps) ? body.usps : [],
      images: Array.isArray(body.images) ? body.images : [],
      reraId: body.reraId || "",
      possessionDate: body.possessionDate || "",
      totalTowers: Number(body.totalTowers) || 1,
      landParcel: body.landParcel || "Details on request",
      configurations: Array.isArray(body.configurations) ? body.configurations : [],
      amenities: Array.isArray(body.amenities) ? (body.amenities as unknown[]).filter((a): a is string => typeof a === "string") : [],
      showFlatVideoUrl: body.showFlatVideoUrl || "PASTE_YOUTUBE_EMBED_URL_HERE",
      walkthroughVideoUrl: body.walkthroughVideoUrl || "PASTE_YOUTUBE_EMBED_URL_HERE",
      nearbyLandmarks: Array.isArray(body.nearbyLandmarks) ? body.nearbyLandmarks : [],
      developer: body.developer && typeof body.developer === "object" ? body.developer : { name: "", since: new Date().getFullYear(), completedProjects: "" },
      metaTitle: body.metaTitle || "",
      metaDescription: body.metaDescription || "",
      subLocation: body.subLocation || "",
      priceValidUntil: body.priceValidUntil || undefined,
      isActive: true,
    };

    projects.push(project);
    writeProjectsFile(projects);
    const res = NextResponse.json({ project: { slug, title } }, { status: 201 });
    logPropertyHttp(request, user, res.status, { project: { slug, title } });
    return res;
  } catch (error) {
    console.error("Create property error:", error);
    const res = NextResponse.json({ error: "Failed to create property" }, { status: 500 });
    logPropertyHttp(request, user, res.status, { error: "Failed to create property" });
    return res;
  }
}