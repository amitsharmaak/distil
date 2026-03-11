import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { config } from "@/lib/config";

/**
 * DELETE /api/data
 * Wipes all user data from the database.
 * Requires { password } in the request body matching DISTIL_DELETE_PASSWORD env var.
 */
export async function DELETE(request: Request) {
  const deletePassword = config.deletePassword;
  if (!deletePassword) {
    return NextResponse.json(
      { error: "DISTIL_DELETE_PASSWORD is not configured" },
      { status: 500 },
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.password !== deletePassword) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
  }

  db.transaction(() => {
    db.prepare("DELETE FROM item_embeddings").run();
    db.prepare("DELETE FROM notifications").run();
    db.prepare("DELETE FROM research_reports").run();
    db.prepare("DELETE FROM feedback").run();
    db.prepare("DELETE FROM ai_summaries").run();
    db.prepare("DELETE FROM items_fts").run();
    db.prepare("DELETE FROM items").run();
    // Reset the last sync timestamps so connectors re-sync from scratch.
    db.prepare("DELETE FROM user_settings WHERE key LIKE '%_last_sync'").run();
  })();

  return NextResponse.json({ ok: true });
}
