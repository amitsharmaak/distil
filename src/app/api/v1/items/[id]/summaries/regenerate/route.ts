import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { getTenantRepositories } from "@/lib/database";
import { knowledgeErrorResponse, parseKnowledgeBody } from "@/lib/knowledge/http";
import { enqueueSummaryRegeneration, regenerateSummarySchema } from "@/lib/knowledge/service";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const auth = await resolveRequestAuthContext(request);
    const input = await parseKnowledgeBody(request, regenerateSummarySchema);
    if (!readPhase2FeatureFlags().knowledgeUi) {
      return Response.json(
        { error: { code: "FEATURE_DISABLED", message: "Knowledge intelligence is not enabled" } },
        { status: 503 }
      );
    }
    const result = await enqueueSummaryRegeneration(
      auth,
      await getTenantRepositories(auth),
      (await context.params).id,
      input
    );
    return Response.json(result, { status: 202 });
  } catch (error) {
    return knowledgeErrorResponse(error);
  }
}
