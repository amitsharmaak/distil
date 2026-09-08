import { ZodError } from "zod";

import { AccessDeniedError } from "@/lib/auth/account";
import { AuthError, errorResponse } from "@/lib/auth/errors";
import { authFailureResponse } from "@/lib/auth/http";
import { LifecycleError, lifecycleErrorResponse } from "./errors";

export async function readLifecycleJson(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (type !== "application/json")
    throw new LifecycleError("INVALID_REQUEST", 415, "Expected JSON");
  try {
    return await request.json();
  } catch {
    throw new LifecycleError("INVALID_REQUEST", 400, "Invalid JSON");
  }
}

export function lifecycleRouteErrorResponse(error: unknown): Response {
  if (error instanceof AuthError) return errorResponse(error);
  if (error instanceof AccessDeniedError) return authFailureResponse(error);
  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid request" } },
      { status: 400 }
    );
  }
  return lifecycleErrorResponse(error);
}
