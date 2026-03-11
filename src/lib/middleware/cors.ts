/**
 * CORS configuration for API routes.
 *
 * In development, allows all origins. In production, restricts to
 * configured allowed origins.
 *
 * SERVER-SIDE ONLY.
 */

import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS_ENV = process.env.PIA_ALLOWED_ORIGINS ?? "";
const IS_DEV = process.env.NODE_ENV !== "production";

function getAllowedOrigins(): string[] {
  if (IS_DEV) return ["*"];
  if (!ALLOWED_ORIGINS_ENV) return [];
  return ALLOWED_ORIGINS_ENV.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function applyCors(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const origin = request.headers.get("origin") ?? "";
  const allowed = getAllowedOrigins();

  if (allowed.includes("*") || allowed.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin || "*");
  }

  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  response.headers.set("Access-Control-Max-Age", "86400");

  return response;
}

/**
 * Handles preflight OPTIONS requests.
 */
export function handlePreflight(request: NextRequest): NextResponse | null {
  if (request.method !== "OPTIONS") return null;

  const origin = request.headers.get("origin") ?? "";
  const allowed = getAllowedOrigins();
  const response = new NextResponse(null, { status: 204 });

  if (allowed.includes("*") || allowed.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin || "*");
  }
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  response.headers.set("Access-Control-Max-Age", "86400");

  return response;
}
