import { readAuthEnvironment } from "@/lib/auth/environment";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getTenantRepositories } from "@/lib/database";
import { readJson, readerErrorResponse } from "@/lib/phase2/reader-http";
import {
  addCollectionItem,
  membershipSchema,
  parseBody,
  removeCollectionItem,
} from "@/lib/phase2/reader-service";

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const auth = await resolveRequestAuthContext(request);
    const params = await context.params;
    const input = parseBody(await readJson(request), membershipSchema);
    const membership = await addCollectionItem(
      await getTenantRepositories(auth),
      params.id,
      params.itemId,
      input.position
    );
    return Response.json({ membership });
  } catch (error) {
    return readerErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const auth = await resolveRequestAuthContext(request);
    const params = await context.params;
    await removeCollectionItem(await getTenantRepositories(auth), params.id, params.itemId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return readerErrorResponse(error);
  }
}
