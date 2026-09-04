import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { readAuthEnvironment } from "@/lib/auth/environment";
import { errorResponse } from "@/lib/auth/errors";
import { requireSessionMutation } from "@/lib/auth/route-helpers";
import { sessionCookieOptions } from "@/lib/auth/session";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireSessionMutation(request, readAuthEnvironment());
    const response = NextResponse.json({ authenticated: false });
    response.cookies.set(SESSION_COOKIE_NAME, "", sessionCookieOptions(0));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
