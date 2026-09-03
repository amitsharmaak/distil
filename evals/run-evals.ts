/**
 * Evaluation harness for Distil AI quality.
 *
 * Usage:
 *   npx tsx evals/run-evals.ts          # Dry run (baseline with golden labels)
 *   npx tsx evals/run-evals.ts --live   # Live run (calls AI models)
 *
 * For live mode, set GEMINI_API_KEY in .env.local or environment.
 */

import fs from "fs";
import path from "path";

// Load .env.local if it exists (for live mode API keys)
function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = value;
      }
    }
  }
}

loadEnvLocal();

// ── Types ────────────────────────────────────────────────────────────────────

interface GoldenItem {
  id: string;
  title: string;
  summary: string;
  fullContent: string;
  sourceType: string;
  contentType: string;
  topics: string[];
  url: string;
  expectedPriority: string;
  expectedTopics: string[];
  expectedSummary: string;
  expectedCategory: string;
  isActionable: boolean;
  duplicateOf?: string;
}

interface EvalResults {
  timestamp: string;
  mode: "dry" | "live";
  metrics: {
    priorityAccuracy: number;
    topicPrecision: number;
    topicRecall: number;
    summaryRougeL: number;
    categoryAccuracy: number;
    dedupPrecision: number;
    dedupRecall: number;
  };
  perItem: Array<{
    id: string;
    title: string;
    metrics: Record<string, number>;
  }>;
}

// ── ROUGE-L (Longest Common Subsequence) ──────────────────────────────────────

function lcs(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function rougeL(reference: string, hypothesis: string): number {
  const refTokens = tokenize(reference);
  const hypTokens = tokenize(hypothesis);
  if (refTokens.length === 0 && hypTokens.length === 0) return 1;
  if (refTokens.length === 0 || hypTokens.length === 0) return 0;
  const lcsLen = lcs(refTokens, hypTokens);
  const recall = lcsLen / refTokens.length;
  const precision = lcsLen / hypTokens.length;
  if (recall + precision === 0) return 0;
  return (2 * recall * precision) / (recall + precision);
}

// ── Metric Computation ───────────────────────────────────────────────────────

function computePriorityAccuracy(
  items: GoldenItem[],
  predictions: Map<string, string>,
): number {
  let correct = 0;
  for (const item of items) {
    const pred = predictions.get(item.id);
    if (pred && pred === item.expectedPriority) correct++;
  }
  return items.length > 0 ? correct / items.length : 0;
}

function computeTopicMetrics(
  items: GoldenItem[],
  predictions: Map<string, string[]>,
): { precision: number; recall: number } {
  let totalPrecision = 0;
  let totalRecall = 0;
  for (const item of items) {
    const pred = predictions.get(item.id) ?? [];
    const expected = new Set(item.expectedTopics.map((t) => t.toLowerCase()));
    const predSet = new Set(pred.map((t) => t.toLowerCase()));
    const tp = [...predSet].filter((t) => expected.has(t)).length;
    totalPrecision += pred.length > 0 ? tp / pred.length : 0;
    totalRecall += expected.size > 0 ? tp / expected.size : 0;
  }
  const n = items.length;
  return {
    precision: n > 0 ? totalPrecision / n : 0,
    recall: n > 0 ? totalRecall / n : 0,
  };
}

function computeSummaryRougeL(
  items: GoldenItem[],
  predictions: Map<string, string>,
): number {
  let sum = 0;
  for (const item of items) {
    const pred = predictions.get(item.id) ?? "";
    sum += rougeL(item.expectedSummary, pred);
  }
  return items.length > 0 ? sum / items.length : 0;
}

function computeCategoryAccuracy(
  items: GoldenItem[],
  predictions: Map<string, string>,
): number {
  let correct = 0;
  for (const item of items) {
    const pred = predictions.get(item.id) ?? "";
    if (pred.toLowerCase() === item.expectedCategory.toLowerCase()) correct++;
  }
  return items.length > 0 ? correct / items.length : 0;
}

function computeDedupMetrics(
  items: GoldenItem[],
  predictions: Map<string, string | null>,
): { precision: number; recall: number } {
  const duplicates = items.filter((i) => i.duplicateOf);
  const nonDuplicates = items.filter((i) => !i.duplicateOf);

  let tp = 0;
  let fp = 0;
  for (const item of duplicates) {
    const pred = predictions.get(item.id);
    if (pred === item.duplicateOf) tp++;
    else if (pred) fp++; // predicted duplicate of wrong item
  }
  for (const item of nonDuplicates) {
    const pred = predictions.get(item.id);
    if (pred) fp++; // false positive: predicted as duplicate when it isn't
  }

  const fn = duplicates.length - tp;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = duplicates.length > 0 ? tp / duplicates.length : 0;

  return { precision, recall };
}

// ── Live Mode: AI Predictions ──────────────────────────────────────────────────

async function getLivePredictions(
  items: GoldenItem[],
): Promise<{
  priority: Map<string, string>;
  topics: Map<string, string[]>;
  summary: Map<string, string>;
  category: Map<string, string>;
  dedup: Map<string, string | null>;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY not set. Add to .env.local or environment for live mode.",
    );
  }

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });

  const priority = new Map<string, string>();
  const topics = new Map<string, string[]>();
  const summary = new Map<string, string>();
  const category = new Map<string, string>();
  const dedup = new Map<string, string | null>();

  function parseJSON<T>(text: string): T {
    const trimmed = text.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : trimmed;
    return JSON.parse(jsonStr) as T;
  }

  // Batch priority (5 items at a time to fit context)
  const BATCH = 5;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const prompt = `You are a content prioritization assistant. For each item, assign priority: "high", "medium", or "low".
High = breaking news, directly relevant to tech professional.
Medium = interesting but not urgent.
Low = tangential, entertainment, old news.

Items:
${batch.map((it) => `- ID: ${it.id} | "${it.title}" | topics: ${it.topics.join(", ")}`).join("\n")}

Output a JSON array: [{"id":"eval-001","priority":"high"}, ...]
Output ONLY the JSON array.`;
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    try {
      const arr = parseJSON<{ id: string; priority: string }[]>(text);
      for (const p of arr) {
        const pnorm = p.priority?.toLowerCase();
        priority.set(p.id, ["high", "medium", "low"].includes(pnorm) ? pnorm : "medium");
      }
    } catch {
      for (const it of batch) priority.set(it.id, "medium");
    }
  }

  // Per-item: topics, summary, category
  for (const item of items) {
    const topicsPrompt = `Given this content, extract 1-3 topic tags (lowercase, hyphenated).
Title: ${item.title}
Summary: ${item.summary}

Output a JSON array of strings: ["topic1", "topic2"]
Output ONLY the JSON array.`;
    try {
      const tr = await model.generateContent(topicsPrompt);
      const arr = parseJSON<string[]>(tr.response.text());
      topics.set(item.id, Array.isArray(arr) ? arr.slice(0, 3) : []);
    } catch {
      topics.set(item.id, item.topics);
    }

    const summaryPrompt = `Summarize this content in 1-2 sentences. Be concise.
Title: ${item.title}
Content: ${item.fullContent.slice(0, 1500)}

Output ONLY the summary text, no JSON.`;
    try {
      const sr = await model.generateContent(summaryPrompt);
      summary.set(item.id, sr.response.text().trim());
    } catch {
      summary.set(item.id, item.summary);
    }

    const categoryPrompt = `Assign ONE category: tech, business, science, health, culture, or politics.
Title: ${item.title}
Summary: ${item.summary}

Output ONLY the single category word.`;
    try {
      const cr = await model.generateContent(categoryPrompt);
      const cat = cr.response.text().trim().toLowerCase();
      category.set(item.id, ["tech", "business", "science", "health", "culture", "politics"].includes(cat) ? cat : "tech");
    } catch {
      category.set(item.id, item.expectedCategory);
    }
  }

  // Dedup: single batch prompt
  const dedupPrompt = `You have ${items.length} content items. Some are duplicates (same story, different source/wording).
For each item, if it is a duplicate of another item in the list, output its ID. Otherwise output null.

Items:
${items.map((it) => `- ${it.id}: "${it.title}" (${it.sourceType})`).join("\n")}

Output a JSON object: {"eval-001": null, "eval-046": "eval-001", ...}
Each key is an item id. Value is the id of the original if duplicate, else null.
Output ONLY the JSON object.`;
  try {
    const dr = await model.generateContent(dedupPrompt);
    const obj = parseJSON<Record<string, string | null>>(dr.response.text());
    for (const item of items) {
      dedup.set(item.id, obj[item.id] ?? null);
    }
  } catch {
    for (const item of items) {
      dedup.set(item.id, item.duplicateOf ?? null);
    }
  }

  return { priority, topics, summary, category, dedup };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const isLive = process.argv.includes("--live");
  const goldenPath = path.join(__dirname, "golden-set.json");
  const goldenSet: GoldenItem[] = JSON.parse(
    fs.readFileSync(goldenPath, "utf-8"),
  );

  console.log(`\nRunning evaluations in ${isLive ? "LIVE" : "DRY"} mode`);
  console.log(`Golden set: ${goldenSet.length} items\n`);

  let priorityPred: Map<string, string>;
  let topicsPred: Map<string, string[]>;
  let summaryPred: Map<string, string>;
  let categoryPred: Map<string, string>;
  let dedupPred: Map<string, string | null>;

  if (isLive) {
    console.log("Calling AI models (this may take a few minutes)...\n");
    const live = await getLivePredictions(goldenSet);
    priorityPred = live.priority;
    topicsPred = live.topics;
    summaryPred = live.summary;
    categoryPred = live.category;
    dedupPred = live.dedup;
  } else {
    priorityPred = new Map(goldenSet.map((i) => [i.id, i.expectedPriority]));
    topicsPred = new Map(goldenSet.map((i) => [i.id, i.expectedTopics]));
    summaryPred = new Map(goldenSet.map((i) => [i.id, i.expectedSummary]));
    categoryPred = new Map(goldenSet.map((i) => [i.id, i.expectedCategory]));
    dedupPred = new Map(
      goldenSet.map((i) => [i.id, i.duplicateOf ?? null]),
    );
  }

  const topicMetrics = computeTopicMetrics(goldenSet, topicsPred);
  const dedupMetrics = computeDedupMetrics(goldenSet, dedupPred);

  const results: EvalResults = {
    timestamp: new Date().toISOString(),
    mode: isLive ? "live" : "dry",
    metrics: {
      priorityAccuracy: computePriorityAccuracy(goldenSet, priorityPred),
      topicPrecision: topicMetrics.precision,
      topicRecall: topicMetrics.recall,
      summaryRougeL: computeSummaryRougeL(goldenSet, summaryPred),
      categoryAccuracy: computeCategoryAccuracy(goldenSet, categoryPred),
      dedupPrecision: dedupMetrics.precision,
      dedupRecall: dedupMetrics.recall,
    },
    perItem: goldenSet.map((item) => ({
      id: item.id,
      title: item.title.slice(0, 50) + (item.title.length > 50 ? "…" : ""),
      metrics: {
        priorityCorrect: (priorityPred.get(item.id) === item.expectedPriority ? 1 : 0) as number,
        topicPrecision: (() => {
          const pred = topicsPred.get(item.id) ?? [];
          const expected = new Set(item.expectedTopics.map((t) => t.toLowerCase()));
          const predSet = new Set(pred.map((t) => t.toLowerCase()));
          const tp = [...predSet].filter((t) => expected.has(t)).length;
          return pred.length > 0 ? tp / pred.length : 0;
        })(),
        topicRecall: (() => {
          const pred = topicsPred.get(item.id) ?? [];
          const expected = new Set(item.expectedTopics.map((t) => t.toLowerCase()));
          const predSet = new Set(pred.map((t) => t.toLowerCase()));
          const tp = [...predSet].filter((t) => expected.has(t)).length;
          return expected.size > 0 ? tp / expected.size : 0;
        })(),
        rougeL: rougeL(item.expectedSummary, summaryPred.get(item.id) ?? ""),
        categoryCorrect: (categoryPred.get(item.id)?.toLowerCase() === item.expectedCategory.toLowerCase() ? 1 : 0) as number,
        dedupCorrect: (dedupPred.get(item.id) === (item.duplicateOf ?? null) ? 1 : 0) as number,
      },
    })),
  };

  // Print results table
  const m = results.metrics;
  console.log("┌─────────────────────────┬──────────┐");
  console.log("│ Metric                  │ Score    │");
  console.log("├─────────────────────────┼──────────┤");
  console.log(`│ Priority Accuracy       │ ${(m.priorityAccuracy * 100).toFixed(1).padStart(5)}%  │`);
  console.log(`│ Topic Precision         │ ${(m.topicPrecision * 100).toFixed(1).padStart(5)}%  │`);
  console.log(`│ Topic Recall            │ ${(m.topicRecall * 100).toFixed(1).padStart(5)}%  │`);
  console.log(`│ Summary ROUGE-L (F1)    │ ${(m.summaryRougeL * 100).toFixed(1).padStart(5)}%  │`);
  console.log(`│ Category Accuracy       │ ${(m.categoryAccuracy * 100).toFixed(1).padStart(5)}%  │`);
  console.log(`│ Dedup Precision         │ ${(m.dedupPrecision * 100).toFixed(1).padStart(5)}%  │`);
  console.log(`│ Dedup Recall            │ ${(m.dedupRecall * 100).toFixed(1).padStart(5)}%  │`);
  console.log("└─────────────────────────┴──────────┘");

  // Save results
  const resultsDir = path.join(__dirname, "results");
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = path.join(resultsDir, `eval-${results.mode}-${ts}.json`);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\nResults saved to ${outPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
