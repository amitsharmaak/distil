export class LifecycleError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "INVALID_REQUEST"
      | "FRESH_AUTH_REQUIRED"
      | "QUOTA_EXCEEDED"
      | "NOT_READY"
      | "EXPIRED"
      | "UNAVAILABLE",
    readonly status: number,
    message: string,
    readonly recovery?: { kind: "CONTACT_OPERATOR_FOR_NEW_INVITATION" }
  ) {
    super(message);
    this.name = "LifecycleError";
  }
}

export function lifecycleErrorResponse(error: unknown): Response {
  if (error instanceof LifecycleError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.recovery ? { recovery: error.recovery } : {}),
        },
      },
      { status: error.status }
    );
  }
  return Response.json(
    { error: { code: "UNAVAILABLE", message: "Account lifecycle is temporarily unavailable" } },
    { status: 503 }
  );
}
