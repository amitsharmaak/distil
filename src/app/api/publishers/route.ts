import { NextResponse } from "next/server";

import { apiLogger } from "@/lib/logger";
import { PUBLISHERS } from "@/lib/connectors/publishers/registry";
import { getStatus } from "@/lib/connectors/publishers/session";
import { getQueueStats } from "@/lib/connectors/publishers/queue";

export async function GET() {
  try {
    const publishers = await Promise.all(
      PUBLISHERS.map(async (p) => {
        const status = await getStatus(p);
        return {
          id: p.id,
          name: p.name,
          homeUrl: p.homeUrl,
          status,
          queueStats: getQueueStats(p.id),
        };
      }),
    );

    return NextResponse.json({ publishers });
  } catch (err) {
    apiLogger.error({ err }, "GET /api/publishers failed");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
