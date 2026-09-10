import { AuthError } from "@/lib/auth/errors";
import { requireAllowedOrigin } from "@/lib/auth/origin";

export const NEON_AUTH_ROUTE_METHODS = {
  "get-session": ["GET"],
  "magic-link/verify": ["GET"],
  "sign-out": ["POST"],
} as const;

export function isAllowedNeonAuthRoute(path: readonly string[], method: string): boolean {
  const allowed = NEON_AUTH_ROUTE_METHODS[path.join("/") as keyof typeof NEON_AUTH_ROUTE_METHODS];
  return Boolean(allowed?.includes(method as never));
}

export type NeonAuthHandler = (
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) => Promise<Response>;

export function gatedNeonAuthHandler(handler: NeonAuthHandler): NeonAuthHandler {
  return async (request, context) => {
    const { path } = await context.params;
    if (!isAllowedNeonAuthRoute(path, request.method)) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Authentication route is not available" } },
        { status: 404 }
      );
    }
    return handler(request, { params: Promise.resolve({ path }) });
  };
}

export async function dispatchGatedNeonAuth(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
  dependencies: {
    loadAllowedOrigins(): ReadonlySet<string>;
    loadHandler(method: string): NeonAuthHandler | undefined;
  }
): Promise<Response> {
  const { path } = await context.params;
  if (!isAllowedNeonAuthRoute(path, request.method)) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Authentication route is not available" } },
      { status: 404 }
    );
  }
  const needsAllowedOrigins = path.join("/") === "magic-link/verify" || request.method === "POST";
  const allowedOrigins = needsAllowedOrigins ? dependencies.loadAllowedOrigins() : undefined;
  if (path.join("/") === "magic-link/verify") {
    const expectedPaths: Record<string, readonly string[]> = {
      callbackURL: ["/api/auth/invitations/complete", "/api/auth/sign-in/complete", "/account"],
      newUserCallbackURL: [
        "/api/auth/invitations/complete",
        "/api/auth/sign-in/complete",
        "/access-denied",
      ],
      errorCallbackURL: ["/access-denied"],
    };
    const requestUrl = new URL(request.url);
    for (const [name, allowedPaths] of Object.entries(expectedPaths)) {
      const value = requestUrl.searchParams.get(name);
      if (!value) continue;
      let callback: URL;
      try {
        callback = new URL(value);
      } catch {
        throw new AuthError("ORIGIN_NOT_ALLOWED", 403, "Invalid auth callback");
      }
      if (!allowedOrigins?.has(callback.origin) || !allowedPaths.includes(callback.pathname)) {
        throw new AuthError("ORIGIN_NOT_ALLOWED", 403, "Invalid auth callback");
      }
    }
  }
  if (request.method === "POST") requireAllowedOrigin(request, allowedOrigins!);
  const handler = dependencies.loadHandler(request.method);
  if (!handler) return new Response(null, { status: 405 });
  return handler(request, { params: Promise.resolve({ path }) });
}
