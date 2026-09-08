import { readAuthEnvironment } from "@/lib/auth/environment";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { getTenantRepositories } from "@/lib/database";
import { digestErrorResponse, parse, readJson } from "@/lib/digests/http";
import {
  dismissDigest,
  dismissDigestItem,
  dismissDigestItemSchema,
  dismissDigestSchema,
  runDigest,
  runDigestSchema,
} from "@/lib/digests/service";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";

export async function POST(request: Request): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const context = await resolveRequestAuthContext(request);
    const body = await readJson(request);
    const action =
      typeof body === "object" && body !== null ? (body as { action?: unknown }).action : undefined;
    const isDismiss = action === "dismiss";
    const isItemDismiss = action === "dismiss_item";
    const dismissInput = isDismiss ? parse(body, dismissDigestSchema) : undefined;
    const dismissItemInput = isItemDismiss ? parse(body, dismissDigestItemSchema) : undefined;
    const runInput = isDismiss || isItemDismiss ? undefined : parse(body, runDigestSchema);
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
    const store = (await getTenantRepositories(context)).digestExperience;
    if (isDismiss) {
      return Response.json({
        digest: await dismissDigest(context, store, dismissInput!.digestId),
      });
    }
    if (isItemDismiss) {
      return Response.json({
        item: await dismissDigestItem(
          context,
          store,
          dismissItemInput!.digestId,
          dismissItemInput!.itemId
        ),
      });
    }
    return Response.json({ digest: await runDigest(context, store, runInput!) }, { status: 201 });
  } catch (error) {
    return digestErrorResponse(error);
  }
}
