import { NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/crm/auth";
import { getFormQuestions, GraphError, listLeadgenForms } from "@/lib/crm/meta-graph";
import {
  getConnectionByPage,
  getMapping,
  listConnections,
  markConnectionProblem,
  pageTokenFor,
  suggestFieldMap,
} from "@/lib/crm/meta-store";

export const dynamic = "force-dynamic";

/**
 * Lists the Lead Ad forms on a connected Page, each with the question schema the
 * mapping screen is drawn from.
 *
 * The questions are fetched for every form in the list rather than on demand,
 * because the admin's next action after seeing the list is to open one, and a
 * second round trip per form makes that feel slow. Five forms is a handful of
 * cheap reads.
 */
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pageId = new URL(request.url).searchParams.get("pageId");
  const target = pageId || listConnections().find((c) => c.status === "connected")?.pageId;  if (!target) {
    return NextResponse.json({ error: "No Facebook page is connected." }, { status: 400 });
  }

  const connection = getConnectionByPage(target);
  if (!connection) {
    return NextResponse.json({ error: "That page is not connected." }, { status: 404 });
  }

  const token = pageTokenFor(target);
  if (!token) {
    return NextResponse.json(
      { error: "The Facebook connection needs to be refreshed. Reconnect to continue." },
      { status: 409 }
    );
  }

  try {
    const forms = await listLeadgenForms(target, token);

    const withQuestions = await Promise.all(
      forms.map(async (form) => {
        try {
          const questions = await getFormQuestions(form.id, token);
          const saved = getMapping(form.id);
          return {
            ...form,
            questions,
            // A saved map wins over a fresh suggestion, or an admin's deliberate
            // choice would be overwritten every time this list loads.
            fieldMap: saved?.fieldMap ?? suggestFieldMap(questions.map((q) => q.key)),
            saved: !!saved,
            syncEnabled: saved?.syncEnabled ?? false,
            project: saved?.project ?? null,
            callerId: saved?.callerId ?? null,
            smId: saved?.smId ?? null,
            lastSyncedAt: saved?.lastSyncedAt ?? null,
            lastError: saved?.lastError ?? null,
          };
        } catch (error) {
          // One form whose questions will not load should not hide the other
          // four — and it must not hide what is already stored either: the
          // saved mapping still drives the sync toggle and the assignment
          // display, and the UI sends whatever it got back on the next save,
          // so returning nulls here would wipe a saved caller on the next save.
          const saved = getMapping(form.id);
          return {
            ...form,
            questions: [],
            fieldMap: saved?.fieldMap ?? {},
            saved: !!saved,
            syncEnabled: saved?.syncEnabled ?? false,
            project: saved?.project ?? null,
            callerId: saved?.callerId ?? null,
            smId: saved?.smId ?? null,
            lastSyncedAt: saved?.lastSyncedAt ?? null,
            lastError: `Could not read this form's questions: ${(error as GraphError).message}`,
          };
        }
      })
    );

    return NextResponse.json({ pageId: target, pageName: connection.pageName, forms: withQuestions });
  } catch (error) {
    const ge = error as GraphError;
    if (ge.type === "token") {
      markConnectionProblem(target, "Facebook rejected the stored token.", "needs_refresh");
      return NextResponse.json(
        { error: "The Facebook connection needs to be refreshed. Reconnect to continue." },
        { status: 409 }
      );
    }
    if (ge.type === "rate_limit") {
      return NextResponse.json(
        { error: "Facebook is rate limiting requests. Try again in a moment." },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: ge.message || "Could not load forms from Facebook." }, { status: 502 });
  }
}
