import { resolveCurrentAccount } from "@/lib/auth/account-service";
import { authFailureResponse } from "@/lib/auth/http";

export async function GET(request: Request): Promise<Response> {
  try {
    const resolved = await resolveCurrentAccount(request);
    return Response.json({
      access: "active",
      account: { userId: resolved.account.userId, status: resolved.account.status },
      freshAuth: resolved.freshAuth,
    });
  } catch (error) {
    return authFailureResponse(error);
  }
}
