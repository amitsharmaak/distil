/** POST /api/slack/sync — syncs messages from configured Slack channels */

import { NextResponse } from "next/server";
import { syncSlackMessages, isSlackConfigured } from "@/lib/connectors/slack";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST() {
  try {
    if (!isSlackConfigured()) {
      return NextResponse.json(
        { error: "Slack not configured" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const result = await syncSlackMessages();
    return NextResponse.json(
      {
        count: result.items.length,
        items: result.items,
        ...(result.unresolvedChannels.length > 0 && {
          unresolvedChannels: result.unresolvedChannels,
        }),
      },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    console.error("[POST /api/slack/sync]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
