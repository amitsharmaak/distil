/**
 * API route: /api/settings/email-intelligence
 *
 * GET — read allowed email categories.
 * POST — update allowed email categories.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";

const DEFAULT_EMAIL_CATEGORIES = ["newsletter", "digest", "announcement"];

export async function GET(request: Request) {
  try {
    const { repositories } = await requireTenantRoute(request);
    const raw = await repositories.settings.get("email_intelligence_categories");
    const allowedCategories =
      raw === undefined ? DEFAULT_EMAIL_CATEGORIES : (JSON.parse(raw) as string[]);
    return NextResponse.json({ allowedCategories });
  } catch (error) {
    return tenantRouteFailureResponse(error);
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
        { status: 400 }
      );
    }
    const { repositories } = await requireTenantRoute(request);
    await repositories.settings.set(
      "email_intelligence_categories",
      JSON.stringify(body.allowedCategories)
    );
    return NextResponse.json({
      allowedCategories: body.allowedCategories,
    });
  } catch (error) {
    return tenantRouteFailureResponse(error);
  }
}
