/**
 * API route: /api/notifications
 *
 * GET  — list recent notifications + unread count.
 * POST — mark all notifications as read.
 */

import { NextResponse } from "next/server";

import { apiLogger } from "@/lib/logger";
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
} from "@/lib/db";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function GET() {
  try {
    const notifications = getNotifications();
    const unreadCount = getUnreadNotificationCount();
    return NextResponse.json({ notifications, unreadCount }, { headers: CORS_HEADERS });
  } catch (error) {
    apiLogger.error({ err: error }, "GET /api/notifications failed");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export function POST() {
  try {
    markAllNotificationsRead();
    return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
  } catch (error) {
    apiLogger.error({ err: error }, "POST /api/notifications failed");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
