/**
 * Proactive research agent — scans recent items for topic clusters
 * and triggers research when significant developments are detected.
 *
 * SERVER-SIDE ONLY.
 */

import { getItems, getResearchReports, insertNotification } from "@/lib/db";
import { generateJSON } from "@/lib/ai/router";
import { startResearch } from "@/lib/ai/research";
import { aiLogger } from "@/lib/logger";
import type { ContentItem } from "@/lib/types";

interface TopicCluster {
  topic: string;
  items: ContentItem[];
  significance: number;
}

/**
 * Groups recent items by topic and identifies clusters.
 */
function findTopicClusters(
  items: ContentItem[],
  minClusterSize = 3,
): TopicCluster[] {
  const topicMap = new Map<string, ContentItem[]>();

  for (const item of items) {
    for (const topic of item.topics) {
      const normalized = topic.toLowerCase().trim();
      const existing = topicMap.get(normalized) ?? [];
      existing.push(item);
      topicMap.set(normalized, existing);
    }
  }

  const clusters: TopicCluster[] = [];
  for (const [topic, clusterItems] of topicMap) {
    if (clusterItems.length >= minClusterSize) {
      // Significance: more items + more diverse sources = more significant
      const sources = new Set(clusterItems.map((i) => i.sourceType));
      const significance =
        clusterItems.length * (1 + sources.size * 0.5);
      clusters.push({ topic, items: clusterItems, significance });
    }
  }

  clusters.sort((a, b) => b.significance - a.significance);
  return clusters;
}

/**
 * Determines if a topic cluster warrants proactive research.
 */
async function shouldResearch(
  cluster: TopicCluster,
): Promise<{ should: boolean; reason: string }> {
  try {
    const itemTitles = cluster.items
      .slice(0, 5)
      .map((i) => `- ${i.title}`)
      .join("\n");
    const prompt = `Analyze these ${cluster.items.length} recent items about "${cluster.topic}":

${itemTitles}

Is there a significant development or trend worth researching further?
Respond with JSON: { "should": true/false, "reason": "brief explanation", "suggestedQuery": "research query if should=true" }`;

    const result = await generateJSON<{
      should: boolean;
      reason: string;
      suggestedQuery?: string;
    }>(prompt, "research-plan");

    return { should: result.should, reason: result.reason };
  } catch {
    return { should: false, reason: "Analysis failed" };
  }
}

/**
 * Run a proactive research scan on recent items.
 * Called periodically (e.g., every 6 hours via job queue).
 */
export async function runProactiveScan(): Promise<{
  clustersFound: number;
  researchTriggered: number;
}> {
  aiLogger.info("Starting proactive research scan");

  // Get items from the last 7 days
  const recentItems = getItems({ sort: "recent", limit: 100 });
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const filtered = recentItems.filter(
    (i) => new Date(i.createdAt) > cutoff,
  );

  if (filtered.length < 3) {
    aiLogger.info(
      { itemCount: filtered.length },
      "Not enough recent items for proactive scan",
    );
    return { clustersFound: 0, researchTriggered: 0 };
  }

  const clusters = findTopicClusters(filtered, 2);
  let researchTriggered = 0;

  // Build a set of topics already researched in the last 7 days to avoid duplicates
  const recentReports = getResearchReports(50);
  const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentlyResearchedTopics = new Set(
    recentReports
      .filter((r) => new Date(r.created_at) > recentCutoff)
      .map((r) => r.query.toLowerCase()),
  );

  // Only process top 3 clusters to avoid excessive AI calls
  for (const cluster of clusters.slice(0, 3)) {
    const query = `Latest developments in ${cluster.topic}: What's new and why does it matter?`;

    if (recentlyResearchedTopics.has(query.toLowerCase())) {
      aiLogger.info({ topic: cluster.topic }, "Skipping — already researched recently");
      continue;
    }

    const { should, reason } = await shouldResearch(cluster);

    if (should) {
      const reportId = startResearch(query);
      researchTriggered++;

      // Notify user
      if (cluster.items[0]) {
        insertNotification({
          id: crypto.randomUUID(),
          itemId: cluster.items[0].id,
          title: `Research: ${cluster.topic}`,
          message: `Distil detected ${cluster.items.length} items about ${cluster.topic} and started a research report. ${reason}`,
        });
      }

      aiLogger.info(
        { topic: cluster.topic, itemCount: cluster.items.length, reportId },
        "Proactive research triggered",
      );
    }
  }

  aiLogger.info(
    { clustersFound: clusters.length, researchTriggered },
    "Proactive scan complete",
  );
  return { clustersFound: clusters.length, researchTriggered };
}
