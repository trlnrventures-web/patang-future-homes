import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "patang-future-homes-crm-secret-key-2024"
);

const COOKIE_NAME = "crm_token";
const CRM_HOST = /^crm\./i;
const MAIN_URL = "https://patangfuturehomes.com";
const PUBLIC_PATHS = ["/crm/login"];
const PUBLIC_API_PATHS = ["/crm/api/auth/login", "/crm/api/auth/logout"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";

  // ---- Subdomain routing: crm.* host serves only the CRM + public inquiry API ----
  if (CRM_HOST.test(host)) {
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/crm/dashboard", request.url));
    }
    if (pathname.startsWith("/crm") || pathname === "/api/inquiries") {
      // fall through to auth handling below
    } else {
      return NextResponse.redirect(new URL(MAIN_URL + pathname, request.url));
    }
  }

  // ---- CRM API auth ----
  if (pathname.startsWith("/crm/api")) {
    const isPublicApi = PUBLIC_API_PATHS.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    );
    if (isPublicApi) return NextResponse.next();

    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      await jwtVerify(token, SECRET);
      return NextResponse.next();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ---- CRM page auth ----
  if (pathname.startsWith("/crm")) {
    const isPublicPage = PUBLIC_PATHS.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    );
    const token = request.cookies.get(COOKIE_NAME)?.value;

    if (isPublicPage) {
      if (token) {
        try {
          await jwtVerify(token, SECRET);
          return NextResponse.redirect(new URL("/crm/dashboard", request.url));
        } catch {
          // invalid token — show login
        }
      }
      return NextResponse.next();
    }

    if (!token) {
      const url = new URL("/crm/login", request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    try {
      await jwtVerify(token, SECRET);
      return NextResponse.next();
    } catch {
      const url = new URL("/crm/login", request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|m4v|mp4)$).*)",
  ],
};