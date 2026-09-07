/** POST /api/slack/sync — syncs messages from configured Slack channels */

import { NextResponse } from "next/server";
import { requireDormantConnectorRoute } from "@/lib/connectors/route-gate";
import { tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  try {
    return await requireDormantConnectorRoute(request);
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}
