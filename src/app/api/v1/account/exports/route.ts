import { listAccountExports } from "@/lib/lifecycle/exports";
import { lifecycleRouteErrorResponse } from "@/lib/lifecycle/http";
import { requireLifecycleRoute } from "@/lib/lifecycle/route-auth";

export async function GET(request: Request): Promise<Response> {
  try {
    const { repositories } = await requireLifecycleRoute(request);
    return Response.json(
      { exports: await listAccountExports(repositories) },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch (error) {
    return lifecycleRouteErrorResponse(error);
  }
}
