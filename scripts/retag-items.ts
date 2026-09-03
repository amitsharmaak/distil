/**
 * One-time migration: retag all existing items using the canonical taxonomy.
 *
 * Usage:
 *   npx tsx scripts/retag-items.ts [--dry-run]
 *
 * --dry-run  prints what would change without writing to the DB.
 */

import Database from "better-sqlite3";
import path from "path";
import { normalizeTag, normalizeTags, CANONICAL_TOPICS } from "../src/lib/ai/taxonomy";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data/distil.db");
const DRY_RUN = process.argv.includes("--dry-run");

interface RawRow {
  id: string;
  title: string;
  topics: string | null;
}

function main() {
  const db = new Database(DB_PATH, { readonly: DRY_RUN });

  const rows = db.prepare("SELECT id, title, topics FROM items").all() as RawRow[];

  console.log(`Found ${rows.length} items in ${DB_PATH}`);
  if (DRY_RUN) console.log("DRY RUN — no writes will be made.\n");

  let changed = 0;
  let unchanged = 0;

  const update = DRY_RUN
    ? null
    : db.prepare("UPDATE items SET topics = ? WHERE id = ?");

  for (const row of rows) {
    let oldTopics: string[] = [];
    try {
      oldTopics = row.topics ? JSON.parse(row.topics) : [];
    } catch {
      oldTopics = [];
    }

    const newTopics = normalizeTags(oldTopics.map(normalizeTag)).slice(0, 3);

    const oldSorted = [...oldTopics].sort().join(",");
    const newSorted = [...newTopics].sort().join(",");

    if (oldSorted !== newSorted) {
      changed++;
      console.log(`[CHANGE] "${row.title.slice(0, 60)}"`);
      console.log(`  before: [${oldTopics.join(", ")}]`);
      console.log(`  after:  [${newTopics.join(", ")}]`);

      if (update) {
        update.run(JSON.stringify(newTopics), row.id);
      }
    } else {
      unchanged++;
    }
  }

  console.log(`\nSummary: ${changed} items updated, ${unchanged} items unchanged.`);

  // Report surviving non-canonical tags using projected state (works in dry-run too)
  const projectedTags = new Set<string>();
  for (const row of rows) {
    let oldTopics: string[] = [];
    try { oldTopics = row.topics ? JSON.parse(row.topics) : []; } catch { /* ignore */ }
    const projected = normalizeTags(oldTopics.map(normalizeTag)).slice(0, 3);
    for (const t of projected) projectedTags.add(t);
  }
  const nonCanonical = [...projectedTags].filter(t => !CANONICAL_TOPICS.includes(t)).sort();
  if (nonCanonical.length > 0) {
    console.log(`\nNon-canonical tags remaining after migration (${nonCanonical.length}): ${nonCanonical.join(", ")}`);
    console.log("(These are too specific to map automatically — they'll be replaced by canonical tags as items are re-processed by AI.)");
  } else {
    console.log("\nAll tags will be canonical after migration.");
  }

  db.close();
}

main();
