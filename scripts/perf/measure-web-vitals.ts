/**
 * Measure page-load vitals for the built application (phase P0 of the
 * performance plan). Runs through tsx (`npm run perf:vitals`) like the other
 * scripts here so it can reuse the TypeScript test support modules.
 *
 * What it does, all locally and without touching Production:
 *   1. starts a disposable PostgreSQL container (Testcontainers), applies the
 *      Phase 1–3 migrations and roles, creates one active user and seeds a
 *      small library through the tenant repositories;
 *   2. starts `next start` (production mode of tests/support/browser/server.ts)
 *      with the legacy single-user session bridge, the only auth path that
 *      works without a hosted provider;
 *   3. drives Chromium through Playwright with a signed legacy session cookie
 *      and records TTFB, FCP, LCP, request count and transferred bytes for
 *      `/`, `/feed`, `/feed/[id]` and `/settings`, five runs each;
 *   4. writes medians to the gitignored `.perf/` directory and prints them.
 *
 * Requires Docker and a production build. Client API requests are relative to
 * the measured origin, so the build no longer needs an inlined API base URL:
 *
 *   npm run build && npm run perf:vitals
 *
 * `DISTIL_E2E_HOST` / `DISTIL_E2E_PORT` change the origin (default
 * 127.0.0.1:3100, never the dev server's port 3000). Options: `--runs=N`,
 * `--items=N`, `--keep-server`.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Cookie } from "playwright";
import type { Sql } from "postgres";
import { PostgresTestHarness } from "../../tests/support/postgres";
import {
  applyTenantMigrationStage,
  type TenantSchemaMigrationStage,
} from "../../src/lib/postgres/tenant-migration/migrator";
import { buildTenantMigrationReport } from "../../src/lib/postgres/tenant-migration/verifier";
import { createPostgresRepositoryAccess } from "../../src/lib/postgres/tenant-repositories";
import { createAuthContext } from "../../src/lib/contracts/tenant-context";
import { createSessionToken } from "../../src/lib/auth/session";
import { SESSION_COOKIE_NAME } from "../../src/lib/auth/constants";
import type { ContentItem } from "../../src/lib/types";

declare global {
  interface Window {
    __lcp?: number;
    __lcpEntries?: Array<{ startTime: number; size: number; element: string }>;
  }
}

interface Sample {
  ttfb: number;
  fcp: number;
  lcp: number;
  domContentLoaded: number;
  load: number;
  requestCount: number;
  transferredBytes: number;
  documentStatus: number;
  wallMs: number;
  redirected: boolean;
  /** `Server-Timing` values by request path (document and API responses). */
  serverTimings: Record<string, string>;
  /** Every largest-contentful-paint candidate, in order; the last one is `lcp`. */
  lcpEntries: Array<{ startTime: number; size: number; element: string }>;
  /** Raw document HTML, only with `--dump-html`; written to `.perf/`, never to the JSON. */
  documentHtml?: string;
  /** Browser console errors and uncaught exceptions during the load (hydration mismatches show here). */
  consoleErrors: string[];
}

type SampleMetric = Exclude<
  keyof Sample,
  | "documentStatus"
  | "redirected"
  | "serverTimings"
  | "lcpEntries"
  | "documentHtml"
  | "consoleErrors"
>;
const SAMPLE_METRICS: SampleMetric[] = [
  "ttfb",
  "fcp",
  "lcp",
  "domContentLoaded",
  "load",
  "requestCount",
  "transferredBytes",
  "wallMs",
];

interface PageResult {
  runs: number;
  redirected: boolean;
  documentStatus: number;
  medians: Record<SampleMetric, number>;
  samples: Sample[];
}

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const args = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
  const match = args.find((argument) => argument.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
};
const runs = Number(option("runs", "5"));
const itemCount = Number(option("items", "12"));
const keepServer = args.includes("--keep-server");
/** `--dump-html` also writes each route's first document to `.perf/<label>.html`. */
const dumpHtml = args.includes("--dump-html");

const host = process.env.DISTIL_E2E_HOST ?? "127.0.0.1";
const port = Number(process.env.DISTIL_E2E_PORT ?? 3100);
const baseUrl = `http://${host}:${port}`;
const userId = "10000000-0000-4000-8000-00000000a1a1";
const sessionSecret = "distil-perf-vitals-session-secret-0123456789abcdef";
const runtimeRole = "distil_perf_vitals_app";
const runtimePassword = "distil_perf_vitals_password";
const now = new Date();

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!existsSync(resolve(root, ".next/BUILD_ID"))) {
  fail(
    `No production build found. Run \`NEXT_PUBLIC_API_BASE_URL=${baseUrl} npm run build\` first.`
  );
}

async function assertPortFree(): Promise<void> {
  await new Promise<void>((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", () =>
      reject(new Error(`Port ${port} is in use; stop whatever listens there before measuring.`))
    );
    probe.listen(port, host, () => probe.close(() => resolvePort()));
  });
}

function paragraph(index: number): string {
  return `Paragraph ${index}. Distil turns intentional capture into a calm, prioritized daily knowledge experience. It records what was saved, extracts the readable article, summarizes it, and lets the reader search and revisit it later without noise.`;
}

async function seedLibrary(ownerSql: Sql): Promise<string[]> {
  const context = createAuthContext({
    userId,
    actorKind: "user",
    actorId: userId,
    requestId: "20000000-0000-4000-8000-00000000b2b2",
  });
  const repositories = createPostgresRepositoryAccess(ownerSql).getTenantRepositories(context);
  const priorities: ContentItem["priority"][] = ["high", "medium", "low"];
  const ids: string[] = [];
  for (let index = 0; index < itemCount; index += 1) {
    const id = `perf-item-${String(index + 1).padStart(3, "0")}`;
    const createdAt = new Date(now.getTime() - index * 3_600_000).toISOString();
    await repositories.items.insert({
      id,
      title: `Perf baseline article ${index + 1}`,
      summary: `Deterministic summary for article ${index + 1}. ${paragraph(0)}`,
      fullContent: Array.from({ length: 12 }, (_, p) => `<p>${paragraph(p + 1)}</p>`).join("\n"),
      sourceType: "browser-extension",
      contentType: "article",
      topics: ["performance", index % 2 ? "reading" : "capture"],
      url: `https://example.com/perf/${id}`,
      priority: priorities[index % 3],
      isRead: index % 4 === 3,
      createdAt,
      processingStatus: "ready",
    });
    ids.push(id);
  }
  return ids;
}

async function prepareDatabase() {
  const owner = new PostgresTestHarness({ database: "distil_perf", username: "distil" });
  await owner.start();
  await owner.migrate(resolve(root, "src/lib/postgres/migrations"));
  await owner.sql.unsafe("DROP TABLE __distil_test_migrations");
  await owner.sql.unsafe(
    readFileSync(resolve(root, "src/lib/postgres/roles/phase3_roles.sql"), "utf8")
  );
  const migrationsDirectory = resolve(root, "src/lib/postgres/tenant-migrations");
  const stage = (
    name: TenantSchemaMigrationStage,
    extra: Partial<Parameters<typeof applyTenantMigrationStage>[0]> = {}
  ) =>
    applyTenantMigrationStage({
      sql: owner.sql,
      stage: name,
      ownerId: userId,
      migrationsDirectory,
      ...extra,
    });
  await stage("expand");
  const baseline = await buildTenantMigrationReport({
    client: owner.sql,
    stage: "before",
    ownerId: userId,
  });
  await stage("backfill");
  await stage("contract", { baseline });
  await stage("lifecycle");
  await stage("returning-auth");
  await stage("perf-indexes");
  await owner.sql`UPDATE users SET status='active' WHERE id=${userId}::uuid`;
  await owner.sql.unsafe(`
    CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS;
    GRANT distil_runtime TO ${runtimeRole};
  `);
  const itemIds = await seedLibrary(owner.sql);
  const runtimeUrl = new URL(owner.connectionUri);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = runtimePassword;
  return { owner, runtimeUrl: runtimeUrl.toString(), itemIds };
}

function startServer(databaseUrl: string) {
  return spawn("npm", ["exec", "--", "tsx", "tests/support/browser/server.ts", "--start"], {
    cwd: root,
    env: {
      ...process.env,
      DISTIL_E2E_PRODUCTION: "1",
      DISTIL_E2E_HOST: host,
      DISTIL_E2E_PORT: String(port),
      DATABASE_URL: databaseUrl,
      FEATURE_NEON_AUTH: "false",
      FEATURE_CONNECTORS: "false",
      FEATURE_KNOWLEDGE_UI: "true",
      FEATURE_SEARCH: "true",
      FEATURE_ANSWERS: "true",
      FEATURE_PERSONALIZATION: "true",
      FEATURE_DIGESTS: "true",
      DISTIL_LEGACY_USER_ID: userId,
      DISTIL_SESSION_SECRET: sessionSecret,
      DISTIL_WEB_PASSWORD_HASH: "perf-vitals-placeholder-hash",
      DISTIL_ALLOWED_ORIGINS: baseUrl,
      NEXT_PUBLIC_API_BASE_URL: baseUrl,
      LOG_LEVEL: "warn",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("The Next.js server did not become healthy within 120 s");
}

async function measurePage(
  browser: Browser,
  cookie: Cookie,
  path: string,
  settleMs = 500
): Promise<Sample> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([cookie]);
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__lcp = 0;
    window.__lcpEntries = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__lcp = entry.startTime;
        // Which element each candidate was: the difference between "the
        // shell painted" and "the content painted" is invisible otherwise.
        const element = (entry as PerformanceEntry & { element?: Element | null }).element;
        window.__lcpEntries?.push({
          startTime: Math.round(entry.startTime),
          size: (entry as PerformanceEntry & { size?: number }).size ?? 0,
          element: element
            ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""} "${(element.textContent ?? "").trim().slice(0, 40)}"`
            : "",
        });
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 200));
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message.slice(0, 200)}`));
  let requestCount = 0;
  let transferredBytes = 0;
  let documentStatus = 0;
  let documentHtml: Promise<string> | undefined;
  const serverTimings: Record<string, string> = {};
  const pendingSizes: Promise<void>[] = [];
  page.on("response", (response) => {
    requestCount += 1;
    const resourceType = response.request().resourceType();
    if (resourceType === "document" && documentStatus === 0) {
      documentStatus = response.status();
      if (dumpHtml) documentHtml = response.text().catch(() => "");
    }
    if (resourceType === "document" || resourceType === "fetch") {
      pendingSizes.push(
        response
          .headersArray()
          .then((headers) => {
            // Duplicate Server-Timing headers are legal; keep every value.
            const values = headers
              .filter((header) => header.name.toLowerCase() === "server-timing")
              .map((header) => header.value);
            if (values.length === 0) return;
            const url = new URL(response.url());
            serverTimings[`${response.request().method()} ${url.pathname}`] = values.join(" | ");
          })
          .catch(() => undefined)
      );
    }
    pendingSizes.push(
      response
        .request()
        .sizes()
        .then((sizes) => {
          transferredBytes += sizes.responseBodySize + sizes.responseHeadersSize;
        })
        .catch(() => undefined)
    );
  });
  const startedAt = Date.now();
  await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(settleMs);
  await Promise.all(pendingSizes);
  const finalUrl = page.url();
  const vitals = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return {
      ttfb: navigation ? navigation.responseStart : 0,
      fcp: fcp ? fcp.startTime : 0,
      lcp: window.__lcp ?? 0,
      lcpEntries: window.__lcpEntries ?? [],
      domContentLoaded: navigation ? navigation.domContentLoadedEventEnd : 0,
      load: navigation ? navigation.loadEventEnd : 0,
    };
  });
  const html = documentHtml ? await documentHtml : undefined;
  await context.close();
  return {
    ...vitals,
    ...(html !== undefined ? { documentHtml: html } : {}),
    consoleErrors,
    requestCount,
    transferredBytes,
    documentStatus,
    wallMs: Date.now() - startedAt,
    redirected: !finalUrl.startsWith(`${baseUrl}${path}`),
    serverTimings,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function main(): Promise<void> {
  await assertPortFree();
  const { owner, runtimeUrl, itemIds } = await prepareDatabase();
  const server = startServer(runtimeUrl);
  const browser = await chromium.launch();
  try {
    await waitForServer();
    const cookie: Cookie = {
      name: SESSION_COOKIE_NAME,
      value: await createSessionToken(sessionSecret, now),
      domain: host,
      path: "/",
      expires: -1,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    };
    const results: Record<string, PageResult> = {};
    const measureRoute = async (path: string, label: string, settleMs = 500) => {
      const samples: Sample[] = [];
      // One untimed warm-up so route compilation and pool creation are excluded.
      await measurePage(browser, cookie, path, settleMs);
      for (let run = 0; run < runs; run += 1)
        samples.push(await measurePage(browser, cookie, path, settleMs));
      if (dumpHtml && samples[0]?.documentHtml !== undefined) {
        const directory = resolve(root, ".perf");
        mkdirSync(directory, { recursive: true });
        const file = `${label.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root"}.html`;
        writeFileSync(resolve(directory, file), samples[0].documentHtml);
        for (const sample of samples) delete sample.documentHtml;
      }
      results[label] = {
        runs: samples.length,
        redirected: samples.some((sample) => sample.redirected),
        documentStatus: samples[0].documentStatus,
        medians: Object.fromEntries(
          SAMPLE_METRICS.map((key) => [
            key,
            Math.round(median(samples.map((sample) => sample[key]))),
          ])
        ) as Record<SampleMetric, number>,
        samples,
      };
    };
    await measureRoute("/", "/");
    await measureRoute("/feed", "/feed");
    await measureRoute(`/feed/${itemIds[0]}`, "/feed/[id]");
    await measureRoute("/settings", "/settings");
    await owner.sql`UPDATE items SET processing_status='processing' WHERE id=${itemIds[0]}`;
    // Wait through one three-second interval. This pins the network cost and
    // endpoint shape of a feed that is actively polling one processing item.
    await measureRoute("/feed", "/feed (processing)", 3_500);
    const output = {
      generatedAt: new Date().toISOString(),
      buildId: readFileSync(resolve(root, ".next/BUILD_ID"), "utf8").trim(),
      baseUrl,
      itemCount,
      runs,
      pages: results,
    };
    const directory = resolve(root, ".perf");
    mkdirSync(directory, { recursive: true });
    const stamp = output.generatedAt.replace(/[:.]/g, "-");
    const json = `${JSON.stringify(output, null, 2)}\n`;
    writeFileSync(resolve(directory, `web-vitals-${stamp}.json`), json);
    writeFileSync(resolve(directory, "web-vitals-latest.json"), json);
    console.table(
      Object.entries(results).map(([page, result]) => ({
        page,
        status: result.documentStatus,
        redirected: result.redirected,
        "TTFB ms": result.medians.ttfb,
        "FCP ms": result.medians.fcp,
        "LCP ms": result.medians.lcp,
        requests: result.medians.requestCount,
        "kB transferred": Math.round(result.medians.transferredBytes / 1024),
      }))
    );
    for (const [page, result] of Object.entries(results)) {
      const timings = result.samples.at(-1)?.serverTimings ?? {};
      for (const [request, value] of Object.entries(timings)) {
        console.log(`${page}  ${request}  Server-Timing: ${value}`);
      }
    }
    console.log(`Written to .perf/web-vitals-${stamp}.json`);
  } finally {
    await browser.close();
    if (!keepServer) {
      server.kill("SIGTERM");
      await new Promise((r) => server.once("exit", r));
    }
    await owner.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
