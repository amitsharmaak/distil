import { NextResponse } from "next/server";

import { getConnectedEmail } from "@/lib/connectors/gmail";
import { getOAuthToken } from "@/lib/database";

export interface GmailStatusResponse {
  connected: boolean;
  email: string | null;
  lastSync: string | null;
}

/**
 * GET /api/auth/gmail/status
 *
 * Returns the current Gmail connection status. Used by the Sources page
 * to decide whether to show the "Connect" or "Sync Now" button.
 */
export async function GET(): Promise<NextResponse> {
  const [email, token] = await Promise.all([getConnectedEmail(), getOAuthToken("gmail")]);

  const response: GmailStatusResponse = {
    connected: email !== null,
    email,
    lastSync: token?.updated_at ?? null,
  };

  return NextResponse.json(response);
}
