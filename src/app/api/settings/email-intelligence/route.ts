/**
 * API route: /api/settings/email-intelligence
 *
 * GET — read allowed email categories.
 * POST — update allowed email categories.
 */

import { NextRequest, NextResponse } from "next/server";

import { apiLogger } from "@/lib/logger";
import { getUserSetting, setUserSetting } from "@/lib/db";

const DEFAULT_EMAIL_CATEGORIES = ["newsletter", "digest", "announcement"];

export function GET() {
  try {
    const raw = getUserSetting("email_intelligence_categories");
    const allowedCategories =
      raw === undefined
        ? DEFAULT_EMAIL_CATEGORIES
        : (JSON.parse(raw) as string[]);
    return NextResponse.json({ allowedCategories });
  } catch (error) {
    apiLogger.error(
      { err: error },
      "GET /api/settings/email-intelligence failed",
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (
      !Array.isArray(body.allowedCategories) ||
      body.allowedCategories.some((c: unknown) => typeof c !== "string")
    ) {
      return NextResponse.json(
        { error: "allowedCategories must be an array of strings" },
        { status: 400 },
      );
    }
    setUserSetting(
      "email_intelligence_categories",
      JSON.stringify(body.allowedCategories),
    );
    return NextResponse.json({
      allowedCategories: body.allowedCategories,
    });
  } catch (error) {
    apiLogger.error(
      { err: error },
      "POST /api/settings/email-intelligence failed",
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
