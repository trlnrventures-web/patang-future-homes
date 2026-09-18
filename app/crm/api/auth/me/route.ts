import { NextResponse } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/crm/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const dbUser = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .get();

  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      phone: dbUser.phone,
      mustChangePassword: !!dbUser.mustChangePassword,
      lastLoginAt: dbUser.lastLoginAt,
    },
  });
}