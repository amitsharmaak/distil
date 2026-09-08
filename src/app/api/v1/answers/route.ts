import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { getTenantRepositories } from "@/lib/database";
import { createRouterGroundedAnswerGenerator } from "@/lib/knowledge/answer-generator";
import { knowledgeErrorResponse, parseKnowledgeBody } from "@/lib/knowledge/http";
import { answerFromKnowledge, answerRequestSchema, assertDateRange } from "@/lib/knowledge/service";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";

export async function POST(request: Request): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const context = await resolveRequestAuthContext(request);
    const input = await parseKnowledgeBody(request, answerRequestSchema);
    assertDateRange(input.filters ?? {});
    if (!readPhase2FeatureFlags().answers) {
      return Response.json(
        { error: { code: "FEATURE_DISABLED", message: "Grounded answers are not enabled" } },
        { status: 503 }
      );
    }
    if (!process.env.DATABASE_URL) {
      return Response.json(
        { error: { code: "POSTGRES_REQUIRED", message: "Grounded answers require PostgreSQL" } },
        { status: 503 }
      );
    }
    const repositories = await getTenantRepositories(context);
    return Response.json(
      await answerFromKnowledge({
        context,
        request: input,
        store: repositories.passages,
        generator: createRouterGroundedAnswerGenerator(context, repositories),
      })
    );
  } catch (error) {
    return knowledgeErrorResponse(error);
  }
}
