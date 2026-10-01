/**
 * Capture-triage eval: runs the real triage prompt over hand-written fixtures and, optionally,
 * one tenant's saved articles in a LOCAL database, then reports how often a real page would be
 * rejected as junk.
 *
 * Usage:
 *   npm run eval:triage -- --fixtures-only
 *   npm run eval:triage -- --user-id <uuid> [--limit 200] [--labels <file.json>]
 *
 * - Calls the configured model for task "triage-capture" through the global router's
 *   `generateJSON` (in-memory cost accounting only, no audit rows). It costs real tokens.
 * - Reads items with `items.list` only; it never writes to the database, and it refuses any
 *   DATABASE_URL whose host is not loopback. Point it at the local Docker database, for example
 *   `DATABASE_URL=postgres://... npm run eval:triage -- --user-id <uuid>`.
 * - `--labels` is a JSON object `{ "<item id or fixture name>": "junk" | "ok" }`. Database items
 *   count as "ok" unless labelled otherwise.
 * - Prints ids, fixture names and titles only, never page text. Exit code 1 when any "ok" page
 *   would be rejected (a false reject) or when every call failed.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { ResponseSchema } from "@google/generative-ai";

import { shouldRejectAsJunk, type CaptureTriageInput } from "../src/lib/contracts/capture-triage";
import type { ContentItem } from "../src/lib/types";
import {
  confusion,
  costPerCall,
  falseRejects,
  guardedJunk,
  kindDistribution,
  percentile,
  prioritySplit,
  rawModelJunk,
  scoreHistogram,
  type Confusion,
  type TriageEvalRecord,
  type TruthLabel,
} from "./triage-metrics";

// Same convention as evals/run-evals.ts: .env.local fills only variables not already set, so a
// DATABASE_URL passed on the command line (or via `tsx --env-file`) wins.
function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const TRIAGE_TIMEOUT_MS = 8_000;

export function requireLoopbackDatabaseUrl(url: string | undefined): string {
  if (!url) throw new Error("DATABASE_URL is required unless --fixtures-only is set");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `DATABASE_URL must point at localhost; refusing to read from ${parsed.hostname}`
    );
  }
  return url;
}

export interface EvalOptions {
  userId?: string;
  limit: number;
  labelsFile?: string;
  fixturesOnly: boolean;
}

export function parseOptions(argv: string[]): EvalOptions {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index < 0 ? undefined : argv[index + 1];
  };
  const fixturesOnly = argv.includes("--fixtures-only");
  const limit = Number(value("--limit") ?? 200);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
    throw new Error("--limit must be an integer from 1 to 1000");
  }
  const userId = value("--user-id");
  if (!fixturesOnly && !userId) throw new Error("--user-id is required unless --fixtures-only");
  return { userId, limit, labelsFile: value("--labels"), fixturesOnly };
}

interface Fixture {
  name: string;
  url: string;
  title: string;
  text: string;
  label: TruthLabel;
}

interface EvalCase {
  id: string;
  title: string;
  source: "fixture" | "db";
  truth: TruthLabel;
  url: string;
  text: string;
  author?: string;
  publication?: string;
  explicitHighPriority: boolean;
}

function readLabels(file: string | undefined): Map<string, TruthLabel> {
  if (!file) return new Map();
  const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
  const labels = new Map<string, TruthLabel>();
  for (const [id, label] of Object.entries(raw)) {
    if (label !== "junk" && label !== "ok") {
      throw new Error(`--labels: "${id}" must be "junk" or "ok"`);
    }
    labels.set(id, label);
  }
  return labels;
}

function fixtureCases(labels: Map<string, TruthLabel>): EvalCase[] {
  const fixtures = JSON.parse(
    fs.readFileSync(path.join(__dirname, "triage-fixtures.json"), "utf-8")
  ) as Fixture[];
  return fixtures.map((fixture) => ({
    id: fixture.name,
    title: fixture.title,
    source: "fixture",
    truth: labels.get(fixture.name) ?? fixture.label,
    url: fixture.url,
    text: fixture.text,
    explicitHighPriority: false,
  }));
}

const looksLikeHtml = (value: string) => /<\/?[a-z][a-z0-9]*\b[^>]*>/i.test(value);

async function databaseCases(
  options: EvalOptions,
  labels: Map<string, TruthLabel>
): Promise<{ cases: EvalCase[]; skipped: number }> {
  requireLoopbackDatabaseUrl(process.env.DATABASE_URL);
  const [{ createAuthContext, userIdSchema }, client, tenantRepositories, format] =
    await Promise.all([
      import("../src/lib/contracts/tenant-context"),
      import("../src/lib/postgres/client"),
      import("../src/lib/postgres/tenant-repositories"),
      import("../src/lib/format"),
    ]);
  const context = createAuthContext({
    userId: userIdSchema.parse(options.userId),
    actorKind: "system",
    actorId: "00000000-0000-4000-8000-000000000004",
    requestId: randomUUID(),
  });
  const sql = client.createPostgresClient({ max: 1, idleTimeoutSeconds: 2 });
  try {
    const repositories = await tenantRepositories
      .createPostgresRepositoryAccess(sql)
      .getTenantRepositories(context);
    const items: ContentItem[] = await repositories.items.list({
      contentType: "article",
      limit: options.limit,
      sort: "recent",
    });
    let skipped = 0;
    const cases: EvalCase[] = [];
    for (const item of items) {
      const raw = item.fullContent ?? "";
      const text = looksLikeHtml(raw) ? format.htmlToReadableText(raw) : raw.trim();
      if (!text) {
        skipped += 1;
        continue;
      }
      cases.push({
        id: item.id,
        title: item.title,
        source: "db",
        truth: labels.get(item.id) ?? "ok",
        url: item.url,
        text,
        author: item.author,
        publication: item.publication,
        explicitHighPriority: item.manualPriority === "high",
      });
    }
    return { cases, skipped };
  } finally {
    await client.closePostgresClient(sql);
  }
}

export type EvalGenerate = (
  prompt: string,
  responseSchema: ResponseSchema
) => Promise<{ value: unknown; model: string }>;

/** The global, non-tenant router: no DB audit rows, in-memory cost accounting only. */
async function routerGenerate(): Promise<{
  generate: EvalGenerate;
  model: string;
  spentUsd: () => number;
}> {
  const { generateJSON, getEffectiveModel, getDailyUsage } = await import("../src/lib/ai/router");
  const { model } = getEffectiveModel("triage-capture");
  const startUsd = getDailyUsage();
  return {
    model,
    spentUsd: () => getDailyUsage() - startUsd,
    generate: async (prompt, responseSchema) => ({
      value: await generateJSON<unknown>(prompt, "triage-capture", {
        responseSchema,
        timeoutMs: TRIAGE_TIMEOUT_MS,
      }),
      model,
    }),
  };
}

function errorCategory(error: unknown): string {
  if (error && typeof error === "object" && "category" in error) {
    return String((error as { category: unknown }).category);
  }
  return error instanceof Error ? error.name : "unknown";
}

async function triageCase(evalCase: EvalCase, generate: EvalGenerate): Promise<TriageEvalRecord> {
  const { triageCapture, triageInputFromText } = await import("../src/lib/ai/triage-capture");
  const input: CaptureTriageInput = triageInputFromText({
    url: evalCase.url,
    title: evalCase.title,
    author: evalCase.author,
    publication: evalCase.publication,
    text: evalCase.text,
  });
  const base = {
    id: evalCase.id,
    title: evalCase.title,
    source: evalCase.source,
    truth: evalCase.truth,
  };
  let latencyMs: number | undefined;
  const timed: EvalGenerate = async (prompt, schema) => {
    const started = Date.now();
    try {
      return await generate(prompt, schema);
    } finally {
      latencyMs = Date.now() - started;
    }
  };
  try {
    const verdict = await triageCapture(input, timed);
    return {
      ...base,
      kind: verdict.kind,
      priorityScore: verdict.priorityScore,
      rejected: shouldRejectAsJunk(verdict, {
        readableChars: input.readableChars,
        hasUserNotes: false,
        explicitHighPriority: evalCase.explicitHighPriority,
      }),
      latencyMs,
    };
  } catch (error) {
    // Triage fails open: a failed call never rejects the capture.
    return { ...base, rejected: false, latencyMs, error: errorCategory(error) };
  }
}

function confusionTable(label: string, table: Confusion): string {
  return [
    `${label}`,
    `                 predicted junk   predicted ok`,
    `  truth junk     ${String(table.truePositive).padStart(14)}   ${String(table.falseNegative).padStart(12)}`,
    `  truth ok       ${String(table.falsePositive).padStart(14)}   ${String(table.trueNegative).padStart(12)}`,
  ].join("\n");
}

export function formatReport(
  records: TriageEvalRecord[],
  toPriority: (score: number) => "high" | "medium" | "low",
  extra: { model: string; spentUsd?: number; skipped: number }
): string {
  const scores = records.flatMap((record) =>
    record.priorityScore === undefined ? [] : [record.priorityScore]
  );
  const latencies = records.flatMap((record) =>
    record.latencyMs === undefined ? [] : [record.latencyMs]
  );
  const calls = records.filter((record) => record.error === undefined).length;
  const rejects = falseRejects(records);
  const failures = records.filter((record) => record.error !== undefined);
  const lines: string[] = [];
  lines.push(
    `Capture triage eval: ${records.length} pages (${records.filter((r) => r.source === "fixture").length} fixtures, ${records.filter((r) => r.source === "db").length} database items, ${extra.skipped} skipped without text); model ${extra.model}`
  );
  lines.push("");
  lines.push(
    confusionTable("Guarded verdict (shouldRejectAsJunk):", confusion(records, guardedJunk))
  );
  lines.push("");
  lines.push(
    confusionTable("Raw model verdict (kind != content):", confusion(records, rawModelJunk))
  );
  lines.push("");
  lines.push(`False rejects (ok pages that would be rejected): ${rejects.length}`);
  for (const reject of rejects) {
    lines.push(`  - [${reject.source}] ${reject.id}  "${reject.title}"  kind=${reject.kind}`);
  }
  const slipped = records.filter((r) => r.truth === "junk" && !r.rejected);
  if (slipped.length > 0) {
    lines.push(`Junk kept (not rejected): ${slipped.length}`);
    for (const record of slipped) {
      lines.push(`  - [${record.source}] ${record.id}  kind=${record.kind ?? "error"}`);
    }
  }
  lines.push("");
  lines.push(`Kind distribution: ${JSON.stringify(kindDistribution(records))}`);
  lines.push(`Score histogram: ${JSON.stringify(scoreHistogram(scores))}`);
  lines.push(
    `Priority split (>=70 high, >=40 medium): ${JSON.stringify(prioritySplit(scores, toPriority))}`
  );
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  lines.push(
    `Latency: p50 ${p50 === undefined ? "n/a" : `${p50} ms`}, p95 ${p95 === undefined ? "n/a" : `${p95} ms`}`
  );
  if (extra.spentUsd !== undefined) {
    const perCall = costPerCall(extra.spentUsd, calls);
    lines.push(
      `Estimated cost: $${extra.spentUsd.toFixed(6)} total${perCall === undefined ? "" : `, $${perCall.toFixed(6)} per call`}`
    );
  }
  if (failures.length > 0) {
    lines.push(`Failed calls (kept, fail-open): ${failures.length}`);
    for (const failure of failures) {
      lines.push(`  - [${failure.source}] ${failure.id}  ${failure.error}`);
    }
  }
  return lines.join("\n");
}

export async function main(
  argv = process.argv.slice(2),
  overrides: { generate?: EvalGenerate; model?: string } = {}
): Promise<number> {
  loadEnvLocal();
  const options = parseOptions(argv);
  const labels = readLabels(options.labelsFile);
  const cases = fixtureCases(labels);
  let skipped = 0;
  if (!options.fixturesOnly) {
    const fromDatabase = await databaseCases(options, labels);
    cases.push(...fromDatabase.cases);
    skipped = fromDatabase.skipped;
  }

  const router = overrides.generate
    ? { generate: overrides.generate, model: overrides.model ?? "injected", spentUsd: undefined }
    : await routerGenerate();
  const records: TriageEvalRecord[] = [];
  for (const evalCase of cases) {
    records.push(await triageCase(evalCase, router.generate));
  }

  const { scoreToPriority } = await import("../src/lib/ai/prioritize");
  process.stdout.write(
    `${formatReport(records, scoreToPriority, {
      model: router.model,
      spentUsd: router.spentUsd?.(),
      skipped,
    })}\n`
  );
  const falseRejectCount = falseRejects(records).length;
  const allFailed = records.length > 0 && records.every((record) => record.error !== undefined);
  if (allFailed) process.stderr.write("Every triage call failed; the eval is not meaningful.\n");
  return falseRejectCount > 0 || allFailed ? 1 : 0;
}

if (process.argv[1]?.endsWith("triage-eval.ts")) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
