import { z } from "zod";

import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { getTenantRepositories } from "@/lib/database";
import { digestErrorResponse, parse } from "@/lib/digests/http";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";

const querySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(90).default(30) })
  .strict();

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await resolveRequestAuthContext(request);
    const input = parse(
      { limit: new URL(request.url).searchParams.get("limit") ?? undefined },
      querySchema
    );
    if (!readPhase2FeatureFlags().digests) {
      return Response.json(
        { error: { code: "FEATURE_DISABLED", message: "In-app digests are not enabled" } },
        { status: 503 }
      );
    }
    if (!process.env.DATABASE_URL) {
      return Response.json(
        { error: { code: "POSTGRES_REQUIRED", message: "Digests require PostgreSQL" } },
        { status: 503 }
      );
    }
    return Response.json({
      digests: await (
        await getTenantRepositories(context)
      ).digestExperience.listDigests(input.limit),
    });
  } catch (error) {
    return digestErrorResponse(error);
  }
}
