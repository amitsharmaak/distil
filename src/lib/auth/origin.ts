import { AuthError } from "@/lib/auth/errors";

export function requireAllowedOrigin(request: Request, allowedOrigins: ReadonlySet<string>): void {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.has(origin)) {
    throw new AuthError("ORIGIN_NOT_ALLOWED", 403, "Request origin is not allowed");
  }
}
