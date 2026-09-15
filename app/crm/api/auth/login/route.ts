import { NextRequest } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq } from "drizzle-orm";
import { signToken, setAuthCookie } from "@/lib/crm/auth";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return Response.json({ error: "Email and password required" }, { status: 400 });
    }

    const db = getDb();
    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase().trim()))
      .get();

    if (!user || !user.active) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = bcrypt.compareSync(password, user.passwordHash);
    if (!valid) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = await signToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    const headers = setAuthCookie(token);

    return Response.json(
      { user: { id: user.id, name: user.name, email: user.email, role: user.role } },
      { headers }
    );
  } catch (error) {
    console.error("Login error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}