import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireRequestSession, requireSessionMutation } from "@/lib/auth/route-helpers";
import { getRepositorySet } from "@/lib/database";
import { readJson, readerErrorResponse } from "@/lib/phase2/reader-http";
import { annotationCreateSchema, createAnnotation, listAnnotations, parseBody } from "@/lib/phase2/reader-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireRequestSession(request, readAuthEnvironment());
    const annotations = await listAnnotations(await getRepositorySet(), (await context.params).id);
    return Response.json({ annotations });
  } catch (error) {
    return readerErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
    const input = parseBody(await readJson(request), annotationCreateSchema);
    const annotation = await createAnnotation(await getRepositorySet(), (await context.params).id, input);
    return Response.json({ annotation }, { status: 201 });
  } catch (error) {
    return readerErrorResponse(error);
  }
}
