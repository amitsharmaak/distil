import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireSessionMutation } from "@/lib/auth/route-helpers";
import { getRepositorySet } from "@/lib/database";
import { readJson, readerErrorResponse } from "@/lib/phase2/reader-http";
import { addCollectionItem, membershipSchema, parseBody, removeCollectionItem } from "@/lib/phase2/reader-service";

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
    const params = await context.params;
    const input = parseBody(await readJson(request), membershipSchema);
    const membership = await addCollectionItem(await getRepositorySet(), params.id, params.itemId, input.position);
    return Response.json({ membership });
  } catch (error) {
    return readerErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
    const params = await context.params;
    await removeCollectionItem(await getRepositorySet(), params.id, params.itemId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return readerErrorResponse(error);
  }
}
