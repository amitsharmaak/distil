import { NextRequest, NextResponse } from "next/server";
import { getPreferences, getAgentConfig, saveAgentConfig } from "@/lib/ai/preferences";

/** GET /api/ai/preferences — Get current user preferences and agent config. */
export async function GET() {
  const preferences = getPreferences();
  const configRaw = getAgentConfig();
  const agentConfig = configRaw ? JSON.parse(configRaw) : null;

  return NextResponse.json({ preferences, config: agentConfig });
}

/** PUT /api/ai/preferences — Update agent config (from Settings page). */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    saveAgentConfig(JSON.stringify(body));
    return NextResponse.json({ config: body });
  } catch (error) {
    console.error("Preferences update error:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 },
    );
  }
}
