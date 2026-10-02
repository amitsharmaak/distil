import { z } from "zod";

import { getAccountExport } from "@/lib/lifecycle/exports";
import { lifecycleRouteErrorResponse } from "@/lib/lifecycle/http";
import { requireLifecycleRoute } from "@/lib/lifecycle/route-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const { repositories } = await requireLifecycleRoute(request);
    return Response.json(
      { export: await getAccountExport(repositories, id) },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return lifecycleRouteErrorResponse(error);
  }
}
