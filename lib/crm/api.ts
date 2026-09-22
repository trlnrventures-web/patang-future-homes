import { NextResponse } from "next/server";
import { getAuthUser, isAdmin, type AuthUser } from "./auth";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export function unauthorized(message = "Unauthorized"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function serverError(error: unknown): NextResponse {
  console.error("CRM API error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function requireAuth(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) throw new AuthError("Unauthorized");
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireAuth();
  if (!isAdmin(user)) throw new AuthError("Admin access required", 403);
  return user;
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return serverError(error);
}

/**
 * Log an HTTP request/response for the property edit/save pipeline so any
 * browser-side failure (403s, 404s, 500s) can be traced to an exact status
 * and JSON body. Used by POST/GET /crm/api/properties and
 * PATCH/DELETE/GET /crm/api/properties/:slug.
 */
export function logPropertyHttp(
  request: Request,
  user: { email?: string; role?: string } | null,
  status: number,
  body: unknown,
) {
  const url = new URL(request.url);
  const who = user ? `${user.email} (${user.role})` : "anonymous";
  let summary = body;
  if (Array.isArray(body)) {
    summary = { count: body.length };
  } else if (body && typeof body === "object" && "project" in (body as object)) {
    const p = (body as { project?: object }).project;
    summary = { project: { slug: (p as { slug?: string } | undefined)?.slug } };
  }
  console.log(
    `[crm-property] ${request.method} ${url.pathname} by ${who} -> HTTP ${status} ${JSON.stringify(summary)}`,
  );
}