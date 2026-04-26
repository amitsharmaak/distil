import { NextResponse } from "next/server";

import { apiLogger } from "@/lib/logger";
import { getById } from "@/lib/connectors/publishers/registry";
import { getStatus } from "@/lib/connectors/publishers/session";
import { getQueueStats } from "@/lib/connectors/publishers/queue";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const publisher = getById(id);
    if (!publisher) {
      return NextResponse.json(
        { error: "Publisher not found" },
        { status: 404 },
      );
    }

    const { state, checkedAt } = await getStatus(publisher);

    return NextResponse.json({
      id: publisher.id,
      status: state,
      checkedAt,
      queueStats: getQueueStats(publisher.id),
    });
  } catch (err) {
    apiLogger.error({ err }, "GET /api/publishers/[id]/status failed");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
