import { NextResponse } from "next/server";

import { getAuthUrl } from "@/lib/connectors/gmail";

/**
 * GET /api/auth/gmail
 *
 * Initiates the Gmail OAuth2 flow by redirecting the user to Google's
 * consent screen. After the user grants access, Google redirects them
 * to /api/auth/gmail/callback.
 */
export function GET() {
  const url = getAuthUrl();
  return NextResponse.redirect(url);
}
