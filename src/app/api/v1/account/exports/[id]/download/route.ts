import { z } from "zod";

import { readAccountExportDownload } from "@/lib/lifecycle/exports";
import { lifecycleRouteErrorResponse } from "@/lib/lifecycle/http";
import { getLifecycleObjectStore } from "@/lib/lifecycle/object-store-runtime";
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
    const { context, repositories } = await requireLifecycleRoute(request);
    const result = await readAccountExportDownload(
      context,
      repositories,
      getLifecycleObjectStore(),
      id
    );
    return new Response(result.object.body as BodyInit, {
      headers: {
        "content-type": "application/zip",
        "content-length": String(result.object.sizeBytes),
        "content-disposition": `attachment; filename="distil-export-${id}.zip"`,
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return lifecycleRouteErrorResponse(error);
  }
}
