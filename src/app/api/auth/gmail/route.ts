import { NextResponse } from "next/server";

import { getAuthUrl, disconnectGmail } from "@/lib/connectors/gmail";

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

/**
 * DELETE /api/auth/gmail
 *
 * Disconnects Gmail by revoking the OAuth token with Google and
 * removing it from the local database.
 */
export async function DELETE() {
  try {
    await disconnectGmail();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to disconnect Gmail:", err);
    return NextResponse.json(
      { error: "Failed to disconnect Gmail" },
      { status: 500 },
    );
  }
}
