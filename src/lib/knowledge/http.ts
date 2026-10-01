import { AuthError, errorResponse } from "@/lib/auth/errors";
import { KnowledgeServiceError } from "./service";

export function knowledgeErrorResponse(error: unknown): Response {
  if (error instanceof AuthError) return errorResponse(error);
  if (error instanceof KnowledgeServiceError) {
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
