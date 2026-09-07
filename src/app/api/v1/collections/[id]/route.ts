import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireRequestSession, requireSessionMutation } from "@/lib/auth/route-helpers";
import { getRepositorySet } from "@/lib/database";
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
    await requireRequestSession(request, readAuthEnvironment());
    return Response.json(await getCollection(await getRepositorySet(), (await context.params).id));
  } catch (error) {
    return readerErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
    const input = parseBody(await readJson(request), collectionUpdateSchema);
    const collection = await updateCollection(
      await getRepositorySet(),
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
    await requireSessionMutation(request, readAuthEnvironment());
    await deleteCollection(await getRepositorySet(), (await context.params).id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return readerErrorResponse(error);
  }
}
