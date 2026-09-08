import { timingSafeEqual } from "node:crypto";

import { enqueueDigestRuntimeJob } from "@/lib/digests/runtime";
import { enqueueDigest } from "@/lib/digests/service";
import { getControlPlaneRepositories, getTenantRepositories } from "@/lib/database";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";
import {
  createAuthContext,
  createSystemContext,
  requestIdSchema,
  actorIdSchema,
} from "@/lib/contracts/tenant-context";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header) return false;
  const actual = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function enqueue(request: Request): Promise<Response> {
  if (!authorized(request))
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Cron authorization required" } },
      { status: 401 }
    );
  if (!process.env.DATABASE_URL) {
    return Response.json(
      { error: { code: "POSTGRES_REQUIRED", message: "Digests require PostgreSQL" } },
      { status: 503 }
    );
  }
  if (!readPhase2FeatureFlags().digests) {
    return Response.json({ enqueued: false, reason: "FEATURE_DISABLED", job: null });
  }
  try {
    const actorId = actorIdSchema.parse(process.env.DISTIL_SYSTEM_ACTOR_ID ?? "");
    const requestId = requestIdSchema.parse(
      request.headers.get("x-trace-id") ?? crypto.randomUUID()
    );
    const system = createSystemContext({ actorKind: "system", actorId, requestId });
    const accounts = (await getControlPlaneRepositories(system)).accounts;
    let afterUserId: Parameters<typeof accounts.listActiveUserIds>[0]["afterUserId"];
    let scanned = 0;
    let enqueued = 0;
    do {
      const userIds = await accounts.listActiveUserIds({ afterUserId, limit: 100 });
      for (const userId of userIds) {
        const context = createAuthContext({
          userId,
          actorKind: "system",
          actorId,
          requestId: requestIdSchema.parse(crypto.randomUUID()),
        });
        const repositories = await getTenantRepositories(context);
        const store = repositories.digestExperience;
        const job = await enqueueDigest(context, store, await store.getPreferences(), "cron");
        if (job) {
          await enqueueDigestRuntimeJob(context, repositories.jobs, job);
          enqueued += 1;
        }
      }
      scanned += userIds.length;
      afterUserId = userIds.at(-1);
      if (userIds.length < 100) break;
    } while (afterUserId);
    return Response.json({ enqueued, scanned });
  } catch {
    return Response.json(
      { error: { code: "PROCESSING_FAILED", message: "Unable to enqueue digest" } },
      { status: 500 }
    );
  }
}

/** Vercel Cron invokes GET and this endpoint deliberately never generates a digest inline. */
export async function GET(request: Request): Promise<Response> {
  return enqueue(request);
}
