/**
 * POST /api/admin/reprocess-tweets
 *
 * Re-fetches OG data for all tweet items in the DB and updates items.summary
 * with the actual tweet text. Also clears any stale AI summaries so the
 * tweet renderer shows real content going forward.
 *
 * SERVER-SIDE ONLY.
 */

import { NextResponse } from "next/server";
import { getItems, updateItem, db } from "@/lib/db";
import { fetchOG } from "@/lib/og";
import { apiLogger } from "@/lib/logger";

const TWEET_PATTERN = /^https?:\/\/(www\.)?(twitter|x)\.com/;

export async function POST() {
  const allItems = getItems({ limit: 1000 });
  const tweets = allItems.filter((item) => TWEET_PATTERN.test(item.url));

  apiLogger.info({ count: tweets.length }, "Reprocessing tweet items");

  let updated = 0;
  let failed = 0;

  for (const tweet of tweets) {
    try {
      const og = await fetchOG(tweet.url);
      const tweetText = og.description ?? "";

      if (tweetText) {
        updateItem(tweet.id, {
          summary: tweetText,
          fullContent: tweetText,
          // Update title only when OG returned something more specific than the
          // generic "Author on X" fallback (i.e. X Articles have a real title)
          ...(og.title && og.title !== tweet.title ? { title: og.title } : {}),
          ...(og.image && !tweet.thumbnailUrl ? { thumbnailUrl: og.image } : {}),
        });
      }

      // Clear any stale AI summary so the tweet renderer shows raw text
      db.prepare("DELETE FROM ai_summaries WHERE item_id = ?").run(tweet.id);

      updated++;
    } catch (err) {
      apiLogger.warn({ err, itemId: tweet.id }, "Failed to reprocess tweet");
      failed++;
    }
  }

  apiLogger.info({ updated, failed }, "Tweet reprocessing complete");
  return NextResponse.json({ updated, failed, total: tweets.length });
}
