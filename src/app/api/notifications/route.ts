/**
 * API route: /api/notifications
 *
 * GET  — list recent notifications + unread count.
 * POST — mark all notifications as read.
 */

import { NextResponse } from "next/server";

import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  try {
    const { repositories } = await requireTenantRoute(request);
    const [notifications, unreadCount] = await Promise.all([
      repositories.notifications.list(),
      repositories.notifications.unreadCount(),
    ]);
    return NextResponse.json({ notifications, unreadCount }, { headers: CORS_HEADERS });
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { repositories } = await requireTenantRoute(request);
    await repositories.notifications.markAllRead();
    return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}
