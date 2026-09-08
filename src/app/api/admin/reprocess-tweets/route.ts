/**
 * The previous endpoint enumerated every tenant's content through an ambient
 * repository. There is no authenticated operator/control-plane contract for
 * that fanout yet, so it is deliberately unavailable rather than unsafe.
 */
import { NextResponse } from "next/server";

export async function POST(): Promise<Response> {
  return NextResponse.json(
    { error: "Tenant-safe administrative reprocessing is not configured" },
    { status: 503 }
  );
}
