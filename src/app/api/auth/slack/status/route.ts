import { NextResponse } from "next/server";

import { getAllSlackStatuses, type SlackWorkspaceStatus } from "@/lib/connectors/slack";
import { config } from "@/lib/config";

export interface SlackStatusResponse {
  workspaces: SlackWorkspaceStatus[];
  syncChannels: string[];
}

/**
 * GET /api/auth/slack/status
 *
 * Returns status for all connected Slack workspaces.
 */
export async function GET(): Promise<NextResponse> {
  const workspaces = await getAllSlackStatuses();
  const response: SlackStatusResponse = {
    workspaces,
    syncChannels: config.slackChannels,
  };
  return NextResponse.json(response);
}
