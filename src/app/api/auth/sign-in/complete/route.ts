import type { NextRequest } from "next/server";

import { readApplicationOrigin } from "@/lib/auth/app-origin";
import {
  createReturningMagicLinkCompletionHandler,
  exchangeMagicLinkSession,
  neonMagicLinkProvider,
} from "@/lib/auth/magic-link";
import { getNeonAuthServer } from "@/lib/auth/neon-server";
import { getAuthRepositoryPort } from "@/lib/auth/repository-runtime";

export async function GET(request: NextRequest): Promise<Response> {
  let appOrigin: string;
  try {
    appOrigin = readApplicationOrigin();
    const auth = getNeonAuthServer();
    const exchangeResponse = await exchangeMagicLinkSession(
      request,
      auth.middleware({ loginUrl: "/invite" })
    );
    if (exchangeResponse) return exchangeResponse;
    return createReturningMagicLinkCompletionHandler({
      provider: neonMagicLinkProvider(auth),
      repositories: await getAuthRepositoryPort(),
      appOrigin,
    })();
  } catch {
    const fallbackOrigin = process.env.NEXT_PUBLIC_API_BASE_URL ?? new URL(request.url).origin;
    return Response.redirect(new URL("/access-denied", fallbackOrigin));
  }
}
