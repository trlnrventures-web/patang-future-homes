import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "patang-future-homes-crm-secret-key-2024"
);

const COOKIE_NAME = "crm_token";
const CRM_HOST = /^crm\./i;
const MAIN_URL = "https://patangfuturehomes.com";
const PUBLIC_PATHS = [
  "/crm/login",
  "/crm/forgot-password",
  "/crm/reset-password",
];
// reset-password is unauthenticated by necessity: the caller is holding a
// token from their mailbox, not a session. It is protected by that token's
// expiry and single-use rule instead.
// These are reachable without a CRM session, but they are not open: each one
// authenticates itself in the handler. The call-event webhook holds no session
// because the caller is a telephony provider, so it proves itself with an HMAC
// over the raw body instead; the sweep is driven by a cron that holds the same
// shared secret as a bearer token. Both refuse with 503 while the secret is
// unset, so an unconfigured server accepts nothing. The GET on the same
// call-events path still requires a session, since that is the missed-call
// listing and the proxy allowlist is per-path, not per-method.
const PUBLIC_API_PATHS = [
  "/crm/api/auth/login",
  "/crm/api/auth/logout",
  "/crm/api/auth/forgot-password",
  "/crm/api/auth/reset-password",
  "/crm/api/call-events",
  "/crm/api/call-sessions/sweep",
];
const FORCE_CHANGE_PASSWORD_PATH = "/crm/change-password";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";

  // ---- Subdomain routing: crm.* host serves only the CRM + public inquiry API ----
  if (CRM_HOST.test(host)) {
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/crm/dashboard", request.url));
    }
    // The PWA manifest has to be served from the CRM host too. Its start_url is
    // "/", which on this host already resolves to /crm/dashboard, so the one
    // shared manifest is correct here - but the blanket redirect below would
    // otherwise hand the CRM the marketing site's manifest and make the app
    // uninstallable. Static brand assets are already exempt from this proxy by
    // the extension filter in the matcher.
    const isCrmPath =
      pathname.startsWith("/crm") ||
      pathname === "/api/inquiries" ||
      pathname === "/manifest.webmanifest";
    if (!isCrmPath) {
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
          const { payload } = await jwtVerify(token, SECRET);
          if (payload.mustChangePassword && pathname !== FORCE_CHANGE_PASSWORD_PATH) {
            return NextResponse.redirect(new URL(FORCE_CHANGE_PASSWORD_PATH, request.url));
          }
          return NextResponse.redirect(new URL("/crm/dashboard", request.url));
        } catch {
          // invalid token: show login
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
      const { payload } = await jwtVerify(token, SECRET);
      if (payload.mustChangePassword && pathname !== FORCE_CHANGE_PASSWORD_PATH) {
        return NextResponse.redirect(new URL(FORCE_CHANGE_PASSWORD_PATH, request.url));
      }
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