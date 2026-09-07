import { NextResponse } from "next/server";

import { apiLogger, connectorLogger } from "@/lib/logger";
import { getById } from "@/lib/connectors/publishers/registry";
import {
  invalidateStatusCache,
  primeStatusCache,
  runInteractiveLogin,
} from "@/lib/connectors/publishers/session";

type RouteContext = { params: Promise<{ id: string }> };

// This route is local-only while hosted connectors are disabled. Keep its
// declaration within the Hobby deployment ceiling so the dormant route does
// not block Preview builds.
export const maxDuration = 60;

export async function POST(_request: Request, context: RouteContext) {
  let publisherId: string | undefined;
  try {
    const { id } = await context.params;
    publisherId = id;
    const publisher = getById(id);
    if (!publisher) {
      return NextResponse.json({ error: "Publisher not found" }, { status: 404 });
    }

    await runInteractiveLogin(publisher);
    // Trust the just-completed login: persist + cache as connected so the
    // next status fetch (and future page loads) don't relaunch Chromium.
    await primeStatusCache(publisher.id, "connected");
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    if (publisherId) invalidateStatusCache(publisherId);
    connectorLogger.error({ err, publisherId }, "[publishers/login] interactive login failed");
    apiLogger.error({ err }, "POST /api/publishers/[id]/login failed");
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Login failed",
      },
      { status: 500 }
    );
  }
}
