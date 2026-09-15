import { clearAuthCookie } from "@/lib/crm/auth";

export async function POST() {
  return Response.json({ ok: true }, { headers: clearAuthCookie() });
}