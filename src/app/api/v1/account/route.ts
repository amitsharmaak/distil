import {
  AccountProfileValidationError,
  getAccountProfile,
  accountProfileSchema,
  updateAccountProfile,
} from "@/lib/account/profile";
import { resolveCurrentAccount, resolveRequestAuthContext } from "@/lib/auth/account-service";
import { AccessDeniedError } from "@/lib/auth/account";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { AuthError, errorResponse } from "@/lib/auth/errors";
import { authFailureResponse } from "@/lib/auth/http";
import { requireAllowedOrigin } from "@/lib/auth/origin";
import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";
import { getTenantRepositories } from "@/lib/database";

const sensitiveHeaders = { "cache-control": "private, no-store" };

function failure(error: unknown): Response {
  if (error instanceof AccessDeniedError) return authFailureResponse(error);
  if (error instanceof AuthError) return errorResponse(error);
  if (error instanceof AccountProfileValidationError) {
    return errorResponse(new AuthError("INVALID_REQUEST", 400, error.message));
  }
  return errorResponse(error);
}

async function resolveAccountView(request: Request) {
  if (!readNeonAuthFoundation().enabled) {
    return { context: await resolveRequestAuthContext(request), status: "active" as const };
  }
  const resolved = await resolveCurrentAccount(request);
  return {
    context: resolved.context,
    status: resolved.account.status,
    email: resolved.account.primaryEmail ?? resolved.identity.email,
  };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const accountView = await resolveAccountView(request);
    const repositories = await getTenantRepositories(accountView.context);
    const profile = await getAccountProfile(repositories.settings);
    return Response.json(
      {
        account: {
          userId: accountView.context.userId,
          status: accountView.status,
          ...(accountView.email ? { email: accountView.email } : {}),
          ...profile,
        },
      },
      { headers: sensitiveHeaders }
    );
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    requireAllowedOrigin(request, readAuthEnvironment().allowedOrigins);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AuthError("INVALID_REQUEST", 400, "A JSON account profile is required");
    }
    const parsed = accountProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new AuthError("INVALID_REQUEST", 400, "Account profile contains invalid fields");
    }
    const accountView = await resolveAccountView(request);
    const repositories = await getTenantRepositories(accountView.context);
    const profile = await updateAccountProfile(repositories.settings, parsed.data);
    return Response.json(
      {
        account: {
          userId: accountView.context.userId,
          status: accountView.status,
          ...(accountView.email ? { email: accountView.email } : {}),
          ...profile,
        },
      },
      { headers: sensitiveHeaders }
    );
  } catch (error) {
    return failure(error);
  }
}
