import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { insertFeedback, getItemById } from "@/lib/db";
import { updatePreferencesFromFeedback } from "@/lib/ai/preferences";
import { reprioritize } from "@/lib/ai/prioritize";

/** POST /api/ai/feedback — Submit feedback on a content item. */
export async function POST(req: NextRequest) {
  try {
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
      return NextResponse.json({ error: "rating must be 1 (like) or -1 (dislike)" }, { status: 400 });
    }

    const item = getItemById(itemId);
    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const feedback = insertFeedback({
      id: crypto.randomUUID(),
      itemId,
      rating,
      reason,
    });

    // Fire-and-forget: update preferences and re-prioritize after feedback
    (async () => {
      try {
        await updatePreferencesFromFeedback();
        await reprioritize(false);
      } catch (err) {
        apiLogger.error({ err }, "Background preference/priority update failed");
      }
    })();

    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error) {
    apiLogger.error({ err: error }, "Feedback error");
    return NextResponse.json(
      { error: "Failed to submit feedback" },
      { status: 500 },
    );
  }
}
