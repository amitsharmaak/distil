import { NextRequest, NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { generateSummary } from "@/lib/ai/summarize";
import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";
import { AIProviderError } from "@/lib/ai/errors";
import { AIQuotaExceededError } from "@/lib/ai/router";
import { isTwitterUrl } from "@/lib/utils";

/** POST /api/ai/summarize — Generate an AI summary for a content item. */
export async function POST(req: NextRequest) {
  try {
    const { context, repositories } = await requireTenantRoute(req);
    const body = await req.json();
    const { itemId, length, force } = body as {
      itemId?: string;
      length?: "brief" | "detailed";
      force?: boolean;
    };

    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }

    const item = await repositories.items.findById(itemId);
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (isTwitterUrl(item.url)) {
      return NextResponse.json(
        { error: "AI summaries are not available for Twitter/X posts" },
        { status: 400 }
      );
    }

    const result = await generateSummary(context, repositories, itemId, { length, force });

    return NextResponse.json({
      summary: result.summary,
      cached: result.cached,
      itemId,
    });
  } catch (error) {
    const authFailure = tenantRouteFailureResponse(error);
    if (authFailure.status !== 503) return authFailure;
    apiLogger.error({ err: error, event: "summary_failed" }, "Summarize error");
    if (error instanceof AIQuotaExceededError) {
      return NextResponse.json(
        {
          error: "Your AI usage limit has been reached. Try again after it resets.",
          code: "AI_BUDGET",
        },
        { status: 429 }
      );
    }
    if (error instanceof AIProviderError) {
      const messages: Record<string, string> = {
        quota: "The AI service has reached its usage limit. Please try again later.",
        authentication:
          "The AI service configuration needs attention. Your original article is still available.",
        invalid_request:
          "The AI service could not process this article. Your original article is still available.",
        invalid_output: "The AI service returned an incomplete summary. Please try again.",
      };
      return NextResponse.json(
        {
          error:
            messages[error.category] ??
            "The AI service is temporarily unavailable. Please try again.",
          code: error.code,
        },
        { status: error.category === "quota" ? 429 : 503 }
      );
    }
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
  }
}
