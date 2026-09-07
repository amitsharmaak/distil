import { z } from "zod";

import { AuthError, errorResponse } from "@/lib/auth/errors";
import { KnowledgeServiceError } from "./service";

export async function parseKnowledgeBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new KnowledgeServiceError("INVALID_REQUEST", 400, "Request body must be valid JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new KnowledgeServiceError(
      "INVALID_REQUEST",
      400,
      parsed.error.issues[0]?.message ?? "Invalid request"
    );
  }
  return parsed.data;
}

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
