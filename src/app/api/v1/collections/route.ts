import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getTenantRepositories } from "@/lib/database";
import { readJson, readerErrorResponse } from "@/lib/phase2/reader-http";
import {
  collectionCreateSchema,
  createCollection,
  listCollections,
  parseBody,
} from "@/lib/phase2/reader-service";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await resolveRequestAuthContext(request);
    return Response.json({
      collections: await listCollections(await getTenantRepositories(context)),
    });
  } catch (error) {
    return readerErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const context = await resolveRequestAuthContext(request);
    const input = parseBody(await readJson(request), collectionCreateSchema);
    const collection = await createCollection(await getTenantRepositories(context), input);
    return Response.json({ collection }, { status: 201 });
  } catch (error) {
    return readerErrorResponse(error);
  }
}
