/**
 * API route: /api/notifications/preferences
 *
 * GET — read notification preferences.
 * PUT — update notification preferences.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  try {
    const { repositories } = await requireTenantRoute(request);
    const raw = await repositories.settings.get("notification_high_priority");
    const highPriorityItems = raw === undefined ? true : raw === "true";
    return NextResponse.json({ highPriorityItems }, { headers: CORS_HEADERS });
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body.highPriorityItems !== "boolean") {
      return NextResponse.json(
        { error: "highPriorityItems must be a boolean" },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    const { repositories } = await requireTenantRoute(request);
    await repositories.settings.set("notification_high_priority", String(body.highPriorityItems));
    return NextResponse.json(
      { highPriorityItems: body.highPriorityItems },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}
