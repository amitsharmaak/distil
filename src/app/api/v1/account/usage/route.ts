import { lifecycleRouteErrorResponse } from "@/lib/lifecycle/http";
import { requireLifecycleRoute } from "@/lib/lifecycle/route-auth";
import { getAccountUsage } from "@/lib/lifecycle/usage";

export async function GET(request: Request): Promise<Response> {
  try {
    const { repositories } = await requireLifecycleRoute(request);
    return Response.json(
      { usage: await getAccountUsage(repositories) },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return lifecycleRouteErrorResponse(error);
  }
}
