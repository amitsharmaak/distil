import type { AuthPrincipal } from "@/lib/contracts/capture";
import type { AuthContext } from "@/lib/contracts/tenant-context";
import type { CaptureService } from "./service";
import { CaptureNotFoundError, CaptureNotRetryableError, QueueUnavailableError } from "./service";
import { CaptureProcessingError } from "./errors";
import { createCaptureSchema } from "./schema";

export interface CaptureHttpDependencies {
  service(context: AuthContext): Promise<CaptureService>;
  authenticate(request: Request): Promise<AuthPrincipal | undefined>;
}

function apiError(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status }
  );
}

async function authorized(
  request: Request,
  authenticate: CaptureHttpDependencies["authenticate"],
  allowedKinds: ReadonlySet<AuthPrincipal["kind"]> = new Set(["session", "capture-token"])
): Promise<AuthPrincipal | Response> {
  try {
    const principal = await authenticate(request);
    if (!principal) return apiError("UNAUTHORIZED", "Authentication is required", 401);
    if (!allowedKinds.has(principal.kind)) {
      return apiError("UNAUTHORIZED", "This credential is not authorized for this operation", 403);
    }
    return principal;
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    if (code === "RATE_LIMITED") return apiError(code, "Too many capture requests", 429);
    if (code === "ORIGIN_NOT_ALLOWED")
      return apiError(code, "The request origin is not allowed", 403);
    throw error;
  }
}

function serviceError(error: unknown): Response | undefined {
  if (error instanceof CaptureNotFoundError) {
    return apiError("CAPTURE_NOT_FOUND", error.message, 404);
  }
  if (error instanceof CaptureNotRetryableError) {
    return apiError("CAPTURE_NOT_RETRYABLE", error.message, 409);
  }
  if (error instanceof QueueUnavailableError) {
    return Response.json(
      {
        error: { code: "QUEUE_UNAVAILABLE", message: error.message },
        receipt: error.receipt,
      },
      { status: 503 }
    );
  }
  if (error instanceof CaptureProcessingError) {
    return apiError(
      error.code === "UNSAFE_URL" ? "UNSAFE_URL" : "PROCESSING_FAILED",
      error.message,
      422
    );
  }
  return undefined;
}

export function createCaptureCollectionHandlers(dependencies: CaptureHttpDependencies) {
  return {
    POST: async (request: Request): Promise<Response> => {
      const principal = await authorized(request, dependencies.authenticate);
      if (principal instanceof Response) return principal;

      let unknownBody: unknown;
      try {
        unknownBody = await request.json();
      } catch {
        return apiError("INVALID_REQUEST", "The request body must be valid JSON", 400);
      }
      const parsed = createCaptureSchema.safeParse(unknownBody);
      if (!parsed.success) {
        return apiError(
          "INVALID_REQUEST",
          "The capture request is invalid",
          400,
          parsed.error.issues
        );
      }
      try {
        const result = await (await dependencies.service(principal.context)).create(parsed.data);
        return Response.json(result, { status: result.duplicate ? 200 : 202 });
      } catch (error) {
        const response = serviceError(error);
        if (response) return response;
        throw error;
      }
    },
    GET: async (request: Request): Promise<Response> => {
      const principal = await authorized(request, dependencies.authenticate, new Set(["session"]));
      if (principal instanceof Response) return principal;
      const value = new URL(request.url).searchParams.get("limit");
      const limit = value === null ? 50 : Number(value);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return apiError("INVALID_REQUEST", "limit must be an integer between 1 and 100", 400);
      }
      return Response.json({
        receipts: await (await dependencies.service(principal.context)).list(limit),
      });
    },
  };
}

export function createCaptureResourceHandlers(dependencies: CaptureHttpDependencies) {
  return {
    GET: async (
      request: Request,
      context: { params: Promise<{ id: string }> }
    ): Promise<Response> => {
      const principal = await authorized(request, dependencies.authenticate, new Set(["session"]));
      if (principal instanceof Response) return principal;
      try {
        return Response.json({
          receipt: await (
            await dependencies.service(principal.context)
          ).get((await context.params).id),
        });
      } catch (error) {
        const response = serviceError(error);
        if (response) return response;
        throw error;
      }
    },
  };
}

export function createCaptureRetryHandlers(dependencies: CaptureHttpDependencies) {
  return {
    POST: async (
      request: Request,
      context: { params: Promise<{ id: string }> }
    ): Promise<Response> => {
      const principal = await authorized(request, dependencies.authenticate, new Set(["session"]));
      if (principal instanceof Response) return principal;
      try {
        return Response.json(
          {
            receipt: await (
              await dependencies.service(principal.context)
            ).retry((await context.params).id),
          },
          { status: 202 }
        );
      } catch (error) {
        const response = serviceError(error);
        if (response) return response;
        throw error;
      }
    },
  };
}
