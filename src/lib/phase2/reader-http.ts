import { AuthError, errorResponse } from "@/lib/auth/errors";
import { ReaderError } from "@/lib/phase2/reader-service";

export function readerErrorResponse(error: unknown): Response {
  if (error instanceof AuthError) return errorResponse(error);
  if (error instanceof ReaderError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  return Response.json(
    { error: { code: "PROCESSING_FAILED", message: "The request could not be completed" } },
    { status: 500 }
  );
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ReaderError("INVALID_REQUEST", 400, "Request body must be valid JSON");
  }
}
