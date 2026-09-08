import { readAuthEnvironment } from "@/lib/auth/environment";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getTenantRepositories } from "@/lib/database";
import { readJson, readerErrorResponse } from "@/lib/phase2/reader-http";
import {
  collectionUpdateSchema,
  deleteCollection,
  getCollection,
  parseBody,
  updateCollection,
} from "@/lib/phase2/reader-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const auth = await resolveRequestAuthContext(request);
    return Response.json(
      await getCollection(await getTenantRepositories(auth), (await context.params).id)
    );
  } catch (error) {
    return readerErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const auth = await resolveRequestAuthContext(request);
    const input = parseBody(await readJson(request), collectionUpdateSchema);
    const collection = await updateCollection(
      await getTenantRepositories(auth),
      (await context.params).id,
      input
    );
    return Response.json({ collection });
  } catch (error) {
    return readerErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const auth = await resolveRequestAuthContext(request);
    await deleteCollection(await getTenantRepositories(auth), (await context.params).id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return readerErrorResponse(error);
  }
}
