import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "patang-future-homes-crm-secret-key-2024"
);

const COOKIE_NAME = "crm_token";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: string;
};

export async function signToken(user: AuthUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(SECRET);
}

export async function verifyToken(
  token: string
): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as AuthUser;
  } catch {
    return null;
  }
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function setAuthCookie(token: string) {
  return {
    "Set-Cookie": `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
  };
}

export function clearAuthCookie() {
  return {
    "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  };
}

export function hasRole(user: AuthUser | null, ...roles: string[]): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}

export function isAdmin(user: AuthUser | null): boolean {
  return hasRole(user, "admin", "sales_head");
}
