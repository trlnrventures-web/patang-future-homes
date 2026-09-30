import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "./db";
import * as schema from "./schema";
import { isAdmin, seesAllLeads, type AuthUser } from "./auth";

/** Longest note the composer will accept, in characters. */
export const NOTE_MAX_LENGTH = 2000;
export const NOTE_PAGE_SIZE = 50;

export type TeamNote = {
  id: number;
  userId: number;
  userName: string;
  userRole: string;
  body: string;
  createdAt: string;
  leadId: number | null;
  leadName: string;
  leadPhone: string;
};

/**
 * Every note on the team feed, newest first. Notes are readable by anyone in
 * the CRM regardless of role — the point of the feed is handover, so scoping it
 * to a person's own leads would defeat it. A note whose lead has since been
 * deleted keeps its text but loses the lead chip.
 */
export function listTeamNotes(limit = NOTE_PAGE_SIZE): TeamNote[] {
  const db = getDb();
  const rows = db
    .select()
    .from(schema.teamNotes)
    .orderBy(desc(schema.teamNotes.createdAt), desc(schema.teamNotes.id))
    .limit(limit)
    .all();

  if (rows.length === 0) return [];

  const users = new Map(db.select().from(schema.users).all().map((u) => [u.id, u]));
  const leads = new Map(
    db
      .select()
      .from(schema.leads)
      .where(isNull(schema.leads.deletedAt))
      .all()
      .map((l) => [l.id, l]),
  );

  return rows.map((n) => {
    const author = users.get(n.userId);
    const lead = n.leadId ? leads.get(n.leadId) : undefined;
    return {
      id: n.id,
      userId: n.userId,
      userName: author?.name || "Unknown",
      userRole: author?.role || "",
      body: n.body,
      createdAt: n.createdAt,
      leadId: lead ? lead.id : null,
      leadName: lead?.name || "",
      leadPhone: lead ? lead.whatsappNumber || lead.phone || "" : "",
    };
  });
}

/**
 * Links a note to a lead the author is allowed to see, so a caller cannot use
 * the composer as a back door onto someone else's lead. Returns the stored
 * leadId, or null when no link was requested.
 */
export function resolveLeadId(
  user: AuthUser,
  leadId: number | null | undefined,
): { leadId: number | null; error?: string } {
  if (leadId === null || leadId === undefined || leadId === 0) {
    return { leadId: null };
  }

  const db = getDb();
  const lead = db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), isNull(schema.leads.deletedAt)))
    .get();

  if (!lead) return { leadId: null, error: "That lead no longer exists" };
  if (isAdmin(user)) return { leadId: lead.id };
  if (user.role === "sales_manager" && lead.assignedSmId === user.id) {
    return { leadId: lead.id };
  }
  if (user.role === "caller" && (lead.assignedCallerId === user.id || seesAllLeads(user))) {
    return { leadId: lead.id };
  }
  return { leadId: null, error: "You can only link a lead assigned to you" };
}

export function createTeamNote(
  user: AuthUser,
  body: string,
  leadId: number | null,
): TeamNote {
  const db = getDb();
  const createdAt = new Date().toISOString();
  const inserted = db
    .insert(schema.teamNotes)
    .values({ userId: user.id, leadId, body, createdAt })
    .returning()
    .get();

  const lead = leadId
    ? db
        .select()
        .from(schema.leads)
        .where(and(eq(schema.leads.id, leadId), isNull(schema.leads.deletedAt)))
        .get()
    : undefined;

  return {
    id: inserted.id,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    body: inserted.body,
    createdAt: inserted.createdAt,
    leadId: lead ? lead.id : null,
    leadName: lead?.name || "",
    leadPhone: lead ? lead.whatsappNumber || lead.phone || "" : "",
  };
}

/** Author or an admin may remove a note. Returns false when not permitted. */
export function deleteTeamNote(user: AuthUser, id: number): boolean {
  const db = getDb();
  const note = db.select().from(schema.teamNotes).where(eq(schema.teamNotes.id, id)).get();
  if (!note) return false;
  if (note.userId !== user.id && !isAdmin(user)) return false;
  db.delete(schema.teamNotes).where(eq(schema.teamNotes.id, id)).run();
  return true;
}
