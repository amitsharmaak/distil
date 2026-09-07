import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireSessionMutation } from "@/lib/auth/route-helpers";
import { PostgresDigestStore } from "@/lib/digests/postgres-store";
import { digestErrorResponse, parse, readJson } from "@/lib/digests/http";
import {
  dismissDigest,
  dismissDigestSchema,
  runDigest,
  runDigestSchema,
} from "@/lib/digests/service";
import { createPostgresClient } from "@/lib/postgres/client";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
    const body = await readJson(request);
    const isDismiss =
      typeof body === "object" &&
      body !== null &&
      (body as { action?: unknown }).action === "dismiss";
    const dismissInput = isDismiss ? parse(body, dismissDigestSchema) : undefined;
    const runInput = isDismiss ? undefined : parse(body, runDigestSchema);
    if (!process.env.DATABASE_URL) {
      return Response.json(
        { error: { code: "POSTGRES_REQUIRED", message: "Digests require PostgreSQL" } },
        { status: 503 }
      );
    }
    const sql = createPostgresClient();
    try {
      const store = new PostgresDigestStore(sql);
      if (isDismiss) {
        return Response.json({
          digest: await dismissDigest(store, dismissInput!.digestId),
        });
      }
      return Response.json({ digest: await runDigest(store, runInput!) }, { status: 201 });
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (error) {
    return digestErrorResponse(error);
  }
}
