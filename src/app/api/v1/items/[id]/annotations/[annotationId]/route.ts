import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireSessionMutation } from "@/lib/auth/route-helpers";
import { getRepositorySet } from "@/lib/database";
import { readJson, readerErrorResponse } from "@/lib/phase2/reader-http";
import { annotationUpdateSchema, deleteAnnotation, parseBody, updateAnnotation } from "@/lib/phase2/reader-service";

type RouteContext = { params: Promise<{ id: string; annotationId: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
    const params = await context.params;
    const input = parseBody(await readJson(request), annotationUpdateSchema);
    const annotation = await updateAnnotation(await getRepositorySet(), params.id, params.annotationId, input);
    return Response.json({ annotation });
  } catch (error) {
    return readerErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
    const params = await context.params;
    await deleteAnnotation(await getRepositorySet(), params.id, params.annotationId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return readerErrorResponse(error);
  }
}
