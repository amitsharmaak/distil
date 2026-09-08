import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { publicExport, requestAccountExport } from "@/lib/lifecycle/exports";
import { lifecycleRouteErrorResponse } from "@/lib/lifecycle/http";
import { requireLifecycleRoute } from "@/lib/lifecycle/route-auth";

export async function POST(request: Request): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const { context, repositories } = await requireLifecycleRoute(request, { fresh: true });
    const result = await requestAccountExport(context, repositories, {
      idempotencyKey: request.headers.get("idempotency-key") ?? "",
    });
    return Response.json(
      { export: publicExport(result.export), job: { id: result.jobId }, created: result.created },
      { status: 202, headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return lifecycleRouteErrorResponse(error);
  }
}
