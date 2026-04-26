/**
 * Proactive research agent — scans recent items for topic clusters
 * and persists suggested research topics for explicit user approval.
 *
 * SERVER-SIDE ONLY.
 */

import { randomUUID } from "crypto";

import {
  getItems,
  getResearchReports,
  insertNotification,
  replacePendingResearchSuggestions,
} from "@/lib/db";
import { generateJSON } from "@/lib/ai/router";
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
      const sources = new Set(clusterItems.map((i) => i.sourceType));
      const significance =
        clusterItems.length * (1 + sources.size * 0.5);
      clusters.push({ topic, items: clusterItems, significance });
    }
  }

  clusters.sort((a, b) => b.significance - a.significance);
  return clusters;
}

const DEFAULT_QUERY_TEMPLATE = (topic: string) =>
  `Latest developments in ${topic}: What's new and why does it matter?`;

/**
 * Determines if a topic cluster warrants a research suggestion (not auto-run).
 */
async function evaluateClusterForSuggestion(
  cluster: TopicCluster,
): Promise<{
  should: boolean;
  reason: string;
  suggestedQuery: string;
}> {
  try {
    const itemTitles = cluster.items
      .slice(0, 5)
      .map((i) => `- ${i.title}`)
      .join("\n");
    const prompt = `Analyze these ${cluster.items.length} recent items about "${cluster.topic}":

${itemTitles}

Is there a significant development or trend worth researching further?
Respond with JSON: { "should": true/false, "reason": "brief explanation", "suggestedQuery": "specific web research query if should=true" }`;

    const result = await generateJSON<{
      should: boolean;
      reason: string;
      suggestedQuery?: string;
    }>(prompt, "research-plan");

    const suggestedQuery =
      (result.suggestedQuery?.trim() || "") ||
      DEFAULT_QUERY_TEMPLATE(cluster.topic);

    return {
      should: result.should,
      reason: result.reason,
      suggestedQuery,
    };
  } catch {
    return {
      should: false,
      reason: "Analysis failed",
      suggestedQuery: DEFAULT_QUERY_TEMPLATE(cluster.topic),
    };
  }
}

export interface ProactiveScanResult {
  clustersFound: number;
  suggestionsSaved: number;
}

/**
 * Run a proactive research scan on recent items.
 * Persists pending suggestions only — deep research runs after user approval.
 */
export async function runProactiveScan(): Promise<ProactiveScanResult> {
  aiLogger.info("Starting proactive research scan");

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
    return { clustersFound: 0, suggestionsSaved: 0 };
  }

  const clusters = findTopicClusters(filtered, 2);

  const recentReports = getResearchReports(50);
  const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentlyResearchedQueries = new Set(
    recentReports
      .filter((r) => new Date(r.created_at) > recentCutoff)
      .map((r) => r.query.toLowerCase().trim()),
  );

  const toSave: Array<{
    id: string;
    topicKey: string;
    topic: string;
    reason: string;
    suggestedQuery: string;
    sourceItemIds: string[];
  }> = [];

  for (const cluster of clusters.slice(0, 3)) {
    const topicKey = cluster.topic.toLowerCase().trim();

    const { should, reason, suggestedQuery } =
      await evaluateClusterForSuggestion(cluster);

    if (!should) continue;

    if (recentlyResearchedQueries.has(suggestedQuery.toLowerCase().trim())) {
      aiLogger.info(
        { topic: cluster.topic },
        "Skipping suggestion — same query researched recently",
      );
      continue;
    }

    toSave.push({
      id: randomUUID(),
      topicKey,
      topic: cluster.topic,
      reason,
      suggestedQuery,
      sourceItemIds: cluster.items.map((i) => i.id),
    });
  }

  replacePendingResearchSuggestions(toSave);

  if (toSave.length > 0 && toSave[0]) {
    const first = toSave[0];
    insertNotification({
      id: randomUUID(),
      itemId: first.sourceItemIds[0] ?? first.id,
      title: "Research suggestions ready",
      message: `Distil found ${toSave.length} topic${toSave.length === 1 ? "" : "s"} you may want to research. Open Research to review and start.`,
    });
  }

  aiLogger.info(
    { clustersFound: clusters.length, suggestionsSaved: toSave.length },
    "Proactive scan complete",
  );

  return {
    clustersFound: clusters.length,
    suggestionsSaved: toSave.length,
  };
}
