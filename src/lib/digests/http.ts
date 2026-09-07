import { AuthError, errorResponse } from "@/lib/auth/errors";
import { readJson } from "@/lib/phase2/reader-http";

import { DigestError } from "./service";

export { readJson };

export function digestErrorResponse(error: unknown): Response {
  if (error instanceof AuthError) return errorResponse(error);
  if (error instanceof DigestError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }
  return Response.json(
    { error: { code: "PROCESSING_FAILED", message: "The digest request could not be completed" } },
    { status: 500 }
  );
}

export function parse<T>(
  value: unknown,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new DigestError("INVALID_REQUEST", 400, "Invalid request");
  return result.data;
}
