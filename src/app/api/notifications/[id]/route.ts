/**
 * API route: /api/notifications/[id]
 *
 * PATCH — mark a single notification as read.
 */

import { NextResponse } from "next/server";

import { apiLogger } from "@/lib/logger";
import { markNotificationRead } from "@/lib/db";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return params.then(({ id }) => {
    try {
      markNotificationRead(id);
      return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
    } catch (error) {
      apiLogger.error({ err: error }, "PATCH /api/notifications/[id] failed");
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500, headers: CORS_HEADERS },
      );
    }
  });
}
