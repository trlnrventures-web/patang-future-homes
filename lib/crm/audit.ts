import { and, desc, eq, gte, lte, inArray } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./schema";

export type AuditCategory = "incentive" | "attendance" | "leave" | "holiday";

export type AuditEntryInput = {
  category: AuditCategory;
  action: string;
  actorUserId?: number | null;
  targetUserId?: number | null;
  entityType?: string | null;
  entityId?: string | number | null;
  summary: string;
  details?: Record<string, unknown> | null;
  createdAt?: string;
};

/** Append an immutable audit entry. Never throws into the calling flow. */
export function writeAuditLog(input: AuditEntryInput): void {
  try {
    const db = getDb();
    db.insert(schema.auditLog)
      .values({
        category: input.category,
        action: input.action,
        actorUserId: input.actorUserId ?? null,
        targetUserId: input.targetUserId ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId == null ? null : String(input.entityId),
        summary: input.summary,
        details: input.details ? JSON.stringify(input.details) : "",
        createdAt: input.createdAt || new Date().toISOString(),
      })
      .run();
  } catch {
    // Audit logging must never break the primary action.
  }
}

export type AuditRow = {
  id: number;
  category: string;
  action: string;
  actorUserId: number | null;
  actorName: string | null;
  targetUserId: number | null;
  targetName: string | null;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  details: string;
  createdAt: string;
};

export function userNameMap(): Map<number, string> {
  const db = getDb();
  const users = db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).all();
  return new Map(users.map((u) => [u.id, u.name]));
}

export function getUserName(userId: number | null | undefined): string | null {
  if (userId == null) return null;
  const db = getDb();
  const u = db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId)).get();
  return u?.name ?? null;
}

export function queryAuditLog(filters: {
  categories?: AuditCategory[];
  action?: string;
  targetUserId?: number;
  from?: string;
  to?: string;
  limit?: number;
}): AuditRow[] {
  const db = getDb();
  const conditions = [];
  if (filters.categories && filters.categories.length > 0) {
    conditions.push(inArray(schema.auditLog.category, filters.categories));
  }
  if (filters.action) conditions.push(eq(schema.auditLog.action, filters.action));
  if (filters.targetUserId) conditions.push(eq(schema.auditLog.targetUserId, filters.targetUserId));
  if (filters.from) conditions.push(gte(schema.auditLog.createdAt, filters.from));
  if (filters.to) conditions.push(lte(schema.auditLog.createdAt, filters.to));

  const rows = db
    .select()
    .from(schema.auditLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.auditLog.createdAt), desc(schema.auditLog.id))
    .limit(filters.limit ?? 500)
    .all();

  const names = userNameMap();
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    action: r.action,
    actorUserId: r.actorUserId ?? null,
    actorName: r.actorUserId != null ? names.get(r.actorUserId) ?? null : null,
    targetUserId: r.targetUserId ?? null,
    targetName: r.targetUserId != null ? names.get(r.targetUserId) ?? null : null,
    entityType: r.entityType ?? null,
    entityId: r.entityId ?? null,
    summary: r.summary,
    details: r.details,
    createdAt: r.createdAt,
  }));
}
