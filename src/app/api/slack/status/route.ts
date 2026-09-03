/** GET /api/slack/status — returns all connected Slack workspace statuses */

import { NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { getAllSlackStatuses } from "@/lib/connectors/slack";
import { config } from "@/lib/config";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const workspaces = await getAllSlackStatuses();
    return NextResponse.json(
      { workspaces, syncChannels: config.slackChannels },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    apiLogger.error({ err }, "GET /api/slack/status failed");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
