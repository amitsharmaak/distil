import { AccessDeniedError } from "@/lib/auth/account";

export function authFailureResponse(error: unknown): Response {
  if (error instanceof AccessDeniedError) {
    const status = error.reason === "unauthenticated" ? 401 : 403;
    return Response.json(
      {
        error: {
          code: status === 401 ? "UNAUTHORIZED" : "ACCESS_DENIED",
          message: "Unable to continue",
        },
      },
      { status }
    );
  }
  return Response.json(
    { error: { code: "AUTH_UNAVAILABLE", message: "Unable to continue" } },
    { status: 503 }
  );
}
