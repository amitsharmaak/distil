import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";

export function legacyAuthBridgeAvailable(
  environment: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return !readNeonAuthFoundation(environment).enabled;
}

export function legacyAuthDisabledResponse(): Response {
  return Response.json(
    { error: { code: "NOT_FOUND", message: "Authentication route is not available" } },
    { status: 404 }
  );
}
