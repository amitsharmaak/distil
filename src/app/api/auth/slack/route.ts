import { NextResponse } from "next/server";

import { getAuthUrl, disconnectSlack } from "@/lib/connectors/slack";

/**
 * GET /api/auth/slack
 *
 * Initiates the Slack User OAuth flow by redirecting to Slack's consent screen.
 * After the user grants access, Slack redirects back to /api/auth/slack/callback.
 */
export function GET() {
  try {
    const url = getAuthUrl();
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("Failed to build Slack auth URL:", err);
    return NextResponse.json(
      { error: "Slack OAuth not configured" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/auth/slack
 *
 * Disconnects a Slack workspace. Expects JSON body { teamId: string }.
 */
export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { teamId?: string };
    const teamId = body.teamId ?? "";
    await disconnectSlack(teamId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to disconnect Slack:", err);
    return NextResponse.json(
      { error: "Failed to disconnect Slack" },
      { status: 500 },
    );
  }
}
