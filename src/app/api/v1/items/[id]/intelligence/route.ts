import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireRequestSession } from "@/lib/auth/route-helpers";
import { getRepositorySet } from "@/lib/database";
import { knowledgeErrorResponse } from "@/lib/knowledge/http";
import { getItemIntelligence } from "@/lib/knowledge/service";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    await requireRequestSession(request, readAuthEnvironment());
    if (!readPhase2FeatureFlags().knowledgeUi) {
      return Response.json(
        { error: { code: "FEATURE_DISABLED", message: "Knowledge intelligence is not enabled" } },
        { status: 503 }
      );
    }
    return Response.json(
      await getItemIntelligence(await getRepositorySet(), (await context.params).id)
    );
  } catch (error) {
    return knowledgeErrorResponse(error);
  }
}
