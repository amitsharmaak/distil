#!/usr/bin/env node
/**
 * Compare the client JavaScript each route ships against the committed
 * baseline (phase P0 of the performance plan).
 *
 *   npm run build && npm run perf:bundle            # print the delta table
 *   npm run perf:bundle -- --write                  # rewrite the baseline
 *   npm run perf:bundle -- --fail-on-growth[=N]     # non-zero exit if any route grows > N gzip bytes
 *
 * Reads `.next/diagnostics/route-bundle-stats.json` (written by `next build`)
 * and gzips every first-load chunk to report raw and gzip bytes per route.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const statsPath = resolve(root, ".next/diagnostics/route-bundle-stats.json");
const baselinePath = resolve(root, "docs/perf/route-bundle-stats.baseline.json");

const args = process.argv.slice(2);
const write = args.includes("--write");
const growthArgument = args.find((argument) => argument.startsWith("--fail-on-growth"));
const growthLimit = growthArgument
  ? Number(growthArgument.split("=")[1] ?? 0)
  : Number.POSITIVE_INFINITY;

if (!existsSync(statsPath)) {
  console.error(`Missing ${statsPath}. Run \`npm run build\` first.`);
  process.exit(1);
}

const gzipCache = new Map();
function gzipBytes(relativePath) {
  const cached = gzipCache.get(relativePath);
  if (cached !== undefined) return cached;
  const absolute = resolve(root, relativePath);
  const bytes = existsSync(absolute) ? gzipSync(readFileSync(absolute), { level: 9 }).length : 0;
  gzipCache.set(relativePath, bytes);
  return bytes;
}

function rawBytes(relativePath) {
  const absolute = resolve(root, relativePath);
  return existsSync(absolute) ? statSync(absolute).size : 0;
}

/** @returns {Record<string, { rawBytes: number; gzipBytes: number; chunks: number }>} */
function measure() {
  const rows = JSON.parse(readFileSync(statsPath, "utf8"));
  const result = {};
  for (const row of rows) {
    const chunks = row.firstLoadChunkPaths ?? [];
    result[row.route] = {
      rawBytes: chunks.reduce((sum, chunk) => sum + rawBytes(chunk), 0),
      gzipBytes: chunks.reduce((sum, chunk) => sum + gzipBytes(chunk), 0),
      chunks: chunks.length,
    };
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function kilobytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

function delta(bytes) {
  if (bytes === 0) return "0";
  const sign = bytes > 0 ? "+" : "-";
  const magnitude = Math.abs(bytes);
  return `${sign}${magnitude < 1024 ? `${magnitude} B` : kilobytes(magnitude)}`;
}

const current = measure();
const currentJson = `${JSON.stringify(
  {
    generatedAt: new Date().toISOString(),
    note: "npm run build && npm run perf:bundle -- --write",
    routes: current,
  },
  null,
  2
)}\n`;

if (write || !existsSync(baselinePath)) {
  writeFileSync(baselinePath, currentJson);
  console.log(`${write ? "Wrote" : "Created"} baseline ${baselinePath}`);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8")).routes ?? {};
const routes = [...new Set([...Object.keys(baseline), ...Object.keys(current)])].sort();

const table = routes.map((route) => {
  const before = baseline[route];
  const after = current[route];
  return {
    route,
    "raw kB": after ? kilobytes(after.rawBytes) : "removed",
    "gzip kB": after ? kilobytes(after.gzipBytes) : "removed",
    "Δ gzip":
      before && after ? delta(after.gzipBytes - before.gzipBytes) : before ? "removed" : "new",
    chunks: after ? after.chunks : 0,
  };
});
console.table(table);

const shared = current["/"] ? gzipBytes : undefined;
if (shared) {
  const rows = JSON.parse(readFileSync(statsPath, "utf8"));
  const chunkSets = rows.map((row) => new Set(row.firstLoadChunkPaths ?? []));
  const sharedChunks = [...(chunkSets[0] ?? [])].filter((chunk) =>
    chunkSets.every((set) => set.has(chunk))
  );
  const sharedGzip = sharedChunks.reduce((sum, chunk) => sum + gzipBytes(chunk), 0);
  const sharedRaw = sharedChunks.reduce((sum, chunk) => sum + rawBytes(chunk), 0);
  console.log(
    `Shared by every route: ${sharedChunks.length} chunks, ${kilobytes(sharedRaw)} raw, ${kilobytes(sharedGzip)} gzip`
  );
}

const grown = routes.filter((route) => {
  const before = baseline[route];
  const after = current[route];
  return before && after && after.gzipBytes - before.gzipBytes > growthLimit;
});
if (grown.length > 0) {
  console.error(`Routes grew beyond ${growthLimit} gzip bytes: ${grown.join(", ")}`);
  process.exit(2);
}
