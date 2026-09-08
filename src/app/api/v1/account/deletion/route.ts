import { readAuthEnvironment } from "@/lib/auth/environment";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import {
  cancelAccountDeletion,
  deletionConfirmationSchema,
  publicDeletion,
  requestAccountDeletion,
} from "@/lib/lifecycle/deletion";
import { lifecycleRouteErrorResponse, readLifecycleJson } from "@/lib/lifecycle/http";
import { requireLifecycleRoute } from "@/lib/lifecycle/route-auth";

export async function POST(request: Request): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const { context, repositories } = await requireLifecycleRoute(request, { fresh: true });
    const input = deletionConfirmationSchema.parse(await readLifecycleJson(request));
    const result = await requestAccountDeletion(context, repositories, input);
    return Response.json(
      {
        deletion: publicDeletion(result.deletion),
        job: { id: result.jobId },
        created: result.created,
      },
      { status: 202, headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return lifecycleRouteErrorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    const { context, repositories } = await requireLifecycleRoute(request, {
      fresh: true,
      allowDeletionPending: true,
    });
    const deletion = await cancelAccountDeletion(context, repositories, {});
    return Response.json(
      { deletion: publicDeletion(deletion) },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return lifecycleRouteErrorResponse(error);
  }
}
