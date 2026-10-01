import {
  adminFailure,
  issueInvitationForAdmin,
  listInvitationsForAdmin,
} from "@/lib/auth/admin-invitations";

const sensitiveHeaders = { "cache-control": "private, no-store" };

/** Admin only: invitations newest first, with masked addresses and no links. */
export async function GET(request: Request): Promise<Response> {
  try {
    return Response.json(
      { invitations: await listInvitationsForAdmin(request) },
      { headers: sensitiveHeaders }
    );
  } catch (error) {
    return adminFailure(error);
  }
}

/** Admin only: issues an invitation and returns its link once. */
export async function POST(request: Request): Promise<Response> {
  try {
    return Response.json(await issueInvitationForAdmin(request), {
      status: 201,
      headers: sensitiveHeaders,
    });
  } catch (error) {
    return adminFailure(error);
  }
}
