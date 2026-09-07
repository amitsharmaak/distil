import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireSessionMutation } from "@/lib/auth/route-helpers";
import { getRepositorySet } from "@/lib/database";
import { knowledgeErrorResponse, parseKnowledgeBody } from "@/lib/knowledge/http";
import { enqueueSummaryRegeneration, regenerateSummarySchema } from "@/lib/knowledge/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
    const input = await parseKnowledgeBody(request, regenerateSummarySchema);
    const result = await enqueueSummaryRegeneration(
      await getRepositorySet(),
      (await context.params).id,
      input
    );
    return Response.json(result, { status: 202 });
  } catch (error) {
    return knowledgeErrorResponse(error);
  }
}
