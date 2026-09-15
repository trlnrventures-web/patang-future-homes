import { getDb } from "./db";
import * as schema from "./schema";
import { eq } from "drizzle-orm";
import type { AuthUser } from "./auth";
import { LEAD_STATUS_LABELS } from "./leads";

export function getUserById(id: number) {
  try {
    return getDb().select().from(schema.users).where(eq(schema.users.id, id)).get();
  } catch {
    return undefined;
  }
}

export function getSmName(id: number | null | undefined): string {
  if (!id) return "";
  const user = getUserById(id);
  return user ? user.name : nameFromId(id);
}

export function nameFromId(id: number): string {
  const user = getUserById(id);
  return user ? user.name : `User #${id}`;
}

export function rolesAllowed(user: AuthUser | null): string[] {
  if (!user) return [];
  switch (user.role) {
    case "admin":
    case "sales_head":
      return ["admin", "sales_head", "sales_manager", "caller", "marketing"];
    case "sales_manager":
      return ["sales_manager", "caller"];
    case "caller":
      return ["caller"];
    default:
      return [];
  }
}

export function userIsAdmin(user: AuthUser | null): boolean {
  return user?.role === "admin" || user?.role === "sales_head";
}

export function getLeadsForUser(user: AuthUser, status?: string) {
  const db = getDb();
  let rows = db.select().from(schema.leads).all();
  if (user.role === "caller") {
    rows = rows.filter((l) => l.assignedCallerId === user.id);
  } else if (user.role === "sales_manager") {
    rows = rows.filter((l) => l.assignedSmId === user.id);
  }
  if (status) {
    rows = rows.filter((l) => l.status === status);
  }
  return rows;
}

export function serializeLead(
  lead: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...lead,
    statusLabel: LEAD_STATUS_LABELS[lead.status as string] || lead.status,
  };
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function isOverdue(dateStr: string): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  return date.getTime() < Date.now();
}