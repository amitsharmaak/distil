import { timingSafeEqual } from "node:crypto";

import { PostgresDigestStore } from "@/lib/digests/postgres-store";
import { enqueueDigestRuntimeJob } from "@/lib/digests/runtime";
import { enqueueDigest } from "@/lib/digests/service";
import { getRepositorySet } from "@/lib/database";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";
import { createPostgresClient } from "@/lib/postgres/client";

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
  const sql = createPostgresClient();
  try {
    const store = new PostgresDigestStore(sql);
    const job = await enqueueDigest(store, await store.getPreferences(), "cron");
    if (job) await enqueueDigestRuntimeJob((await getRepositorySet()).jobs, job);
    return Response.json({ enqueued: Boolean(job), job: job ?? null });
  } catch {
    return Response.json(
      { error: { code: "PROCESSING_FAILED", message: "Unable to enqueue digest" } },
      { status: 500 }
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Vercel Cron invokes GET and this endpoint deliberately never generates a digest inline. */
export async function GET(request: Request): Promise<Response> {
  return enqueue(request);
}
