import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireSessionMutation } from "@/lib/auth/route-helpers";
import { knowledgeErrorResponse, parseKnowledgeBody } from "@/lib/knowledge/http";
import { PostgresPassageSearchStore } from "@/lib/knowledge/retrieval";
import { answerFromKnowledge, answerRequestSchema, assertDateRange } from "@/lib/knowledge/service";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";
import { createPostgresClient } from "@/lib/postgres/client";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
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
    const sql = createPostgresClient();
    try {
      // No generator is wired until provider selection and its evaluation gate are complete.
      return Response.json(
        await answerFromKnowledge({
          request: input,
          store: new PostgresPassageSearchStore(sql),
        })
      );
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (error) {
    return knowledgeErrorResponse(error);
  }
}
