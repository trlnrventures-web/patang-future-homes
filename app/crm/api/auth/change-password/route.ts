import { NextRequest } from "next/server";
import { getDb } from "@/lib/crm/db";
import * as schema from "@/lib/crm/schema";
import { eq } from "drizzle-orm";
import { getAuthUser, signToken, setAuthCookie } from "@/lib/crm/auth";
import bcrypt from "bcryptjs";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { newPassword, currentPassword } = await request.json();

    if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
      return Response.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }

    const db = getDb();
    const dbUser = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get();
    if (!dbUser || !dbUser.active) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only verify the current password when this is an optional change
    // (forced first-login change uses the temporary password directly).
    if (!dbUser.mustChangePassword) {
      if (
        typeof currentPassword !== "string" ||
        !bcrypt.compareSync(currentPassword, dbUser.passwordHash)
      ) {
        return Response.json({ error: "Current password is incorrect" }, { status: 400 });
      }
    }

    db.update(schema.users)
      .set({
        passwordHash: bcrypt.hashSync(newPassword, 10),
        mustChangePassword: false,
        resetRequestedAt: null,
      })
      .where(eq(schema.users.id, user.id))
      .run();

    const token = await signToken({
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      mustChangePassword: false,
    });

    return Response.json(
      {
        user: {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
          role: dbUser.role,
        },
      },
      { status: 200, headers: setAuthCookie(token) }
    );
  } catch (error) {
    console.error("Change password error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}