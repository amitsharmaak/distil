/**
 * API route: /api/notifications/[id]
 *
 * PATCH — mark a single notification as read.
 */

import { NextResponse } from "next/server";

import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { repositories } = await requireTenantRoute(request);
    // RLS scopes this lookup. A foreign identifier is intentionally identical
    // to an absent identifier rather than revealing that another user has it.
    if (!(await repositories.notifications.find(id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
    }
    await repositories.notifications.markRead(id);
    return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}
