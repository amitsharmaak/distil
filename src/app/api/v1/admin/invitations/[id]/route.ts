import { adminFailure, revokeInvitationForAdmin } from "@/lib/auth/admin-invitations";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Admin only: revokes a pending invitation. Optional JSON body `{ reason }`. */
export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { id } = await context.params;
    await revokeInvitationForAdmin(request, id);
    return new Response(null, { status: 204, headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return adminFailure(error);
  }
}
