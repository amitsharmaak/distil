import { NextRequest, NextResponse } from "next/server";

import { apiLogger } from "@/lib/logger";
import { handleCallback } from "@/lib/connectors/gmail";
import { config } from "@/lib/config";

/**
 * GET /api/auth/gmail/callback
 *
 * Handles the OAuth2 callback from Google after the user grants (or denies)
 * access. Exchanges the authorization code for tokens, stores them, and
 * redirects back to the Sources page.
 *
 * Success: redirects to /sources?connected=gmail
 * Failure: redirects to /sources?error=gmail_denied | gmail_failed
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      `${config.apiBaseUrl}/sources?error=gmail_denied`,
    );
  }

  try {
    await handleCallback(code);
    return NextResponse.redirect(
      `${config.apiBaseUrl}/sources?connected=gmail`,
    );
  } catch (err) {
    apiLogger.error({ err }, "Gmail callback token exchange failed");
    return NextResponse.redirect(
      `${config.apiBaseUrl}/sources?error=gmail_failed`,
    );
  }
}
