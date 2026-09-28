import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/crm/auth";
import { badRequest, handleApiError, requireAuth } from "@/lib/crm/api";
import {
  createTeamNote,
  listTeamNotes,
  NOTE_MAX_LENGTH,
  resolveLeadId,
} from "@/lib/crm/team-notes";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAuth();
    return NextResponse.json({ notes: listTeamNotes() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { body?: unknown; leadId?: unknown };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return badRequest("Note cannot be empty");
  if (text.length > NOTE_MAX_LENGTH) {
    return badRequest(`Note is too long (max ${NOTE_MAX_LENGTH} characters)`);
  }

  const requestedLeadId =
    typeof body.leadId === "number" && Number.isInteger(body.leadId) ? body.leadId : null;
  const { leadId, error } = resolveLeadId(user, requestedLeadId);
  if (error) return badRequest(error);

  const note = createTeamNote(user, text, leadId);
  return NextResponse.json({ note }, { status: 201 });
}
