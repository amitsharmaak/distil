import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireRequestSession } from "@/lib/auth/route-helpers";
import { getRepositorySet } from "@/lib/database";
import { knowledgeErrorResponse } from "@/lib/knowledge/http";
import { getItemIntelligence } from "@/lib/knowledge/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireRequestSession(request, readAuthEnvironment());
    return Response.json(
      await getItemIntelligence(await getRepositorySet(), (await context.params).id)
    );
  } catch (error) {
    return knowledgeErrorResponse(error);
  }
}
