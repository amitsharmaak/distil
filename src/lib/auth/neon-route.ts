export const NEON_AUTH_ROUTE_METHODS = {
  "get-session": ["GET"],
  "magic-link/verify": ["GET"],
  "list-sessions": ["GET"],
  "sign-out": ["POST"],
  "revoke-session": ["POST"],
  "revoke-sessions": ["POST"],
  "revoke-all-sessions": ["POST"],
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
