import { readAuthEnvironment } from "@/lib/auth/environment";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getTenantRepositories } from "@/lib/database";
import { readJson, readerErrorResponse } from "@/lib/phase2/reader-http";
import {
  annotationCreateSchema,
  createAnnotation,
  listAnnotations,
  parseBody,
} from "@/lib/phase2/reader-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const auth = await resolveRequestAuthContext(request);
    const annotations = await listAnnotations(
      await getTenantRepositories(auth),
      (await context.params).id
    );
    return Response.json({ annotations });
  } catch (error) {
    return readerErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const auth = await resolveRequestAuthContext(request);
    const input = parseBody(await readJson(request), annotationCreateSchema);
    const annotation = await createAnnotation(
      await getTenantRepositories(auth),
      (await context.params).id,
      input
    );
    return Response.json({ annotation }, { status: 201 });
  } catch (error) {
    return readerErrorResponse(error);
  }
}
