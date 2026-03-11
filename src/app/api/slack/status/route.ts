/** GET /api/slack/status — returns Slack connection status */

import { NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { getSlackStatus } from "@/lib/connectors/slack";

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
    const status = await getSlackStatus();
    return NextResponse.json(status, { headers: CORS_HEADERS });
  } catch (err) {
    apiLogger.error({ err }, "GET /api/slack/status failed");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
