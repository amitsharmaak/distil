import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { requireTenantRoute, tenantRouteFailureResponse } from "@/lib/auth/tenant-route";
import { updatePreferencesFromFeedback } from "@/lib/ai/preferences";
import { reprioritize } from "@/lib/ai/prioritize";

const MAX_REASON_LENGTH = 1_000;

/** POST /api/ai/feedback — Submit feedback on a content item. */
export async function POST(req: NextRequest) {
  try {
    const { context, repositories } = await requireTenantRoute(req);
    const body = await req.json();
    const { itemId, rating, reason } = body as {
      itemId?: string;
      rating?: number;
      reason?: string;
    };

    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }
    if (rating !== 1 && rating !== -1) {
      return NextResponse.json(
        { error: "rating must be 1 (like) or -1 (dislike)" },
        { status: 400 }
      );
    }
    if (reason !== undefined && (typeof reason !== "string" || reason.length > MAX_REASON_LENGTH)) {
      return NextResponse.json(
        { error: `reason must be a string of at most ${MAX_REASON_LENGTH} characters` },
        { status: 400 }
      );
    }

    const item = await repositories.items.findById(itemId);
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const feedback = await repositories.feedback.insert({
      id: crypto.randomUUID(),
      itemId,
      rating,
      reason,
    });

    // Keep tenant identity and repository capability attached to asynchronous work.
    void (async () => {
      try {
        await updatePreferencesFromFeedback(context, repositories);
        await reprioritize(context, repositories, false);
      } catch (err) {
        apiLogger.error(
          { err, userId: context.userId },
          "Background preference/priority update failed"
        );
      }
    })();

    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error) {
    const authFailure = tenantRouteFailureResponse(error);
    if (authFailure.status !== 500) return authFailure;
    apiLogger.error({ err: error }, "Feedback error");
    return NextResponse.json({ error: "Failed to submit feedback" }, { status: 500 });
  }
}
