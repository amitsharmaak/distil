import { NextResponse } from "next/server";

import { apiLogger } from "@/lib/logger";
import { getById } from "@/lib/connectors/publishers/registry";
import { syncPublisher } from "@/lib/connectors/publishers/worker";
import { PublisherAuthRequired } from "@/lib/connectors/publishers/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const publisher = getById(id);
    if (!publisher) {
      return NextResponse.json(
        { error: "Publisher not found" },
        { status: 404 },
      );
    }

    const result = await syncPublisher(publisher.id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PublisherAuthRequired) {
      return NextResponse.json({ error: "auth_required" }, { status: 409 });
    }
    apiLogger.error({ err }, "POST /api/publishers/[id]/sync failed");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
