import { NextRequest, NextResponse } from "next/server";

import { apiLogger } from "@/lib/logger";
import { handleCallback } from "@/lib/connectors/slack";
import { config } from "@/lib/config";

/**
 * GET /api/auth/slack/callback
 *
 * Handles the OAuth2 callback from Slack after the user grants (or denies) access.
 * Exchanges the authorization code for a user token, stores it, and redirects
 * back to the Sources page.
 *
 * Success: redirects to /sources?connected=slack
 * Failure: redirects to /sources?error=slack_denied | slack_failed
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      `${config.apiBaseUrl}/sources?error=slack_denied`,
    );
  }

  try {
    await handleCallback(code);
    return NextResponse.redirect(
      `${config.apiBaseUrl}/sources?connected=slack`,
    );
  } catch (err) {
    apiLogger.error({ err }, "Slack callback token exchange failed");
    return NextResponse.redirect(
      `${config.apiBaseUrl}/sources?error=slack_failed`,
    );
  }
}
