import type { ApiErrorCode } from "@/lib/contracts/capture";

export class AuthError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AuthError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }

  return Response.json(
    { error: { code: "PROCESSING_FAILED", message: "The request could not be completed" } },
    { status: 500 }
  );
}
