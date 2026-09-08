import { z } from "zod";

import { LifecycleError } from "@/lib/lifecycle/errors";
import { publicExport } from "@/lib/lifecycle/exports";
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
    const record = await repositories.lifecycle.findExport(id);
    if (!record) throw new LifecycleError("NOT_FOUND", 404, "Export not found");
    return Response.json(
      { export: publicExport(record) },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return lifecycleRouteErrorResponse(error);
  }
}
