import { readAuthEnvironment } from "@/lib/auth/environment";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getTenantRepositories } from "@/lib/database";
import { readJson, readerErrorResponse } from "@/lib/phase2/reader-http";
import { deleteNote, getNote, noteSchema, parseBody, putNote } from "@/lib/phase2/reader-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const auth = await resolveRequestAuthContext(request);
    const note = await getNote(await getTenantRepositories(auth), (await context.params).id);
    return Response.json({ note: note ?? null });
  } catch (error) {
    return readerErrorResponse(error);
  }
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const auth = await resolveRequestAuthContext(request);
    const input = parseBody(await readJson(request), noteSchema);
    const note = await putNote(
      await getTenantRepositories(auth),
      (await context.params).id,
      input.body
    );
    return Response.json({ note });
  } catch (error) {
    return readerErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const auth = await resolveRequestAuthContext(request);
    await deleteNote(await getTenantRepositories(auth), (await context.params).id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return readerErrorResponse(error);
  }
}
