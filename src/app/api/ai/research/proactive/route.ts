import { NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { runProactiveScan } from "@/lib/agent/proactive-research";

/** POST /api/ai/research/proactive — Run an on-demand proactive topic scan. */
export async function POST() {
  try {
    const result = await runProactiveScan();
    return NextResponse.json(result);
  } catch (error) {
    apiLogger.error({ err: error }, "Proactive scan error");
    return NextResponse.json(
      { error: "Proactive scan failed" },
      { status: 500 },
    );
  }
}
