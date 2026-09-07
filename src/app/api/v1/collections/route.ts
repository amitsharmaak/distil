import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireRequestSession, requireSessionMutation } from "@/lib/auth/route-helpers";
import { getRepositorySet } from "@/lib/database";
import { readJson, readerErrorResponse } from "@/lib/phase2/reader-http";
import {
  collectionCreateSchema,
  createCollection,
  listCollections,
  parseBody,
} from "@/lib/phase2/reader-service";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireRequestSession(request, readAuthEnvironment());
    return Response.json({ collections: await listCollections(await getRepositorySet()) });
  } catch (error) {
    return readerErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
    const input = parseBody(await readJson(request), collectionCreateSchema);
    const collection = await createCollection(await getRepositorySet(), input);
    return Response.json({ collection }, { status: 201 });
  } catch (error) {
    return readerErrorResponse(error);
  }
}
