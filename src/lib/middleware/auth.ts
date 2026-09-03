/**
 * Authentication middleware for API routes.
 *
 * Single-user auth via API token:
 * - If DISTIL_API_TOKEN is set in env, all /api/* requests must include
 *   Authorization: Bearer <token>
 * - If DISTIL_API_TOKEN is not set, all requests are allowed (dev mode).
 *
 * SERVER-SIDE ONLY.
 */

import { NextRequest, NextResponse } from "next/server";

const API_TOKEN = process.env.DISTIL_API_TOKEN ?? "";

export function isAuthEnabled(): boolean {
  return API_TOKEN.length > 0;
}

/**
 * Checks the Authorization header against the configured API token.
 * Returns null if auth passes, or a 401 NextResponse if it fails.
 */
export function checkAuth(request: NextRequest): NextResponse | null {
  if (!isAuthEnabled()) return null;

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json(
      { error: "Missing Authorization header" },
      { status: 401 },
    );
  }

  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (token !== API_TOKEN) {
    return NextResponse.json(
      { error: "Invalid API token" },
      { status: 401 },
    );
  }

  return null;
}
