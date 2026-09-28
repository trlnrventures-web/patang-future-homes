import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/crm/auth";
import { handleApiError, requireAuth } from "@/lib/crm/api";
import { deleteTeamNote } from "@/lib/crm/team-notes";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const noteId = Number.parseInt(id, 10);
    if (!Number.isFinite(noteId)) {
      return NextResponse.json({ error: "Invalid note id" }, { status: 400 });
    }

    if (!deleteTeamNote(user, noteId)) {
      return NextResponse.json({ error: "Note not found or not allowed" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
