import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireRequestSession, requireSessionMutation } from "@/lib/auth/route-helpers";
import { getRepositorySet } from "@/lib/database";
import { readJson, readerErrorResponse } from "@/lib/phase2/reader-http";
import { deleteNote, getNote, noteSchema, parseBody, putNote } from "@/lib/phase2/reader-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireRequestSession(request, readAuthEnvironment());
    const note = await getNote(await getRepositorySet(), (await context.params).id);
    return Response.json({ note: note ?? null });
  } catch (error) {
    return readerErrorResponse(error);
  }
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
    const input = parseBody(await readJson(request), noteSchema);
    const note = await putNote(await getRepositorySet(), (await context.params).id, input.body);
    return Response.json({ note });
  } catch (error) {
    return readerErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
    await deleteNote(await getRepositorySet(), (await context.params).id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return readerErrorResponse(error);
  }
}
