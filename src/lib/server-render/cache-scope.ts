import { headers } from "next/headers";
import { cache } from "react";
import { AccessDeniedError } from "@/lib/auth/account";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { IDENTITY_HEADER } from "@/lib/auth/identity-token";
import { readNeonAuthFoundation } from "@/lib/auth/neon-auth-foundation";
import { readSessionCookie } from "@/lib/auth/request";

/** Verified identity only. Public hosted pages must not trigger a second provider lookup. */
export const loadClientCacheScope = cache(async (): Promise<string | null> => {
  const requestHeaders = await headers();
  const request = new Request("http://distil.local/", { headers: requestHeaders });
  if (readNeonAuthFoundation().enabled) {
    if (!requestHeaders.has(IDENTITY_HEADER)) return null;
  } else if (!readSessionCookie(request)) return null;
  try {
    return (await resolveRequestAuthContext(request)).userId;
  } catch (error) {
    if (error instanceof AccessDeniedError) return null;
    throw error;
  }
});
