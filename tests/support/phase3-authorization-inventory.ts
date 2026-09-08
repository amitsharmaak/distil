import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { discoverNextRouteSurfaces } from "./authorization-matrix";

interface ApiInventoryEntry {
  path: string;
  source: string;
  methods: string[];
  scope: string;
  testProfile: string;
  requiredPrincipal?: string;
}

interface PageInventoryEntry {
  path: string;
  source: string;
  testProfile: string;
}

interface TableInventoryEntry {
  name: string;
  source: string;
  requiredScope: string;
}

interface WorkerInventoryEntry {
  id: string;
  source: string;
  requiredTenant: string;
}

export interface Phase3AuthorizationInventory {
  schemaVersion: 1;
  baselineCommit: string;
  apiRoutes: ApiInventoryEntry[];
  pageLoaders: PageInventoryEntry[];
  tables: TableInventoryEntry[];
  workersAndCrons: WorkerInventoryEntry[];
  inventoryCoverage: {
    expectedDrizzleTableCount: number;
    expectedApiRouteFileCount: number;
    expectedPageFileCount: number;
  };
}

export interface CsrfRouteExemption {
  surface: string;
  control: "dormant-no-side-effect" | "composed-principal-origin";
  reason: string;
}

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRouteSegment(segment: string): string {
  const optionalCatchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/);
  if (optionalCatchAll) return `:${optionalCatchAll[1]}*`;
  const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
  if (catchAll) return `:${catchAll[1]}+`;
  const dynamic = segment.match(/^\[(.+)\]$/);
  return dynamic ? `:${dynamic[1]}` : segment;
}

function routePathFromSource(source: string): string {
  const relativeSource = relative("src/app/api", source).split(sep);
  relativeSource.pop();
  return `/${["api", ...relativeSource.map(normalizeRouteSegment)].join("/")}`;
}

function pagePathFromSource(source: string): string {
  const relativeSource = relative("src/app", source).split(sep);
  relativeSource.pop();
  const path = relativeSource.map(normalizeRouteSegment).join("/");
  return path ? `/${path}` : "/";
}

export function loadPhase3AuthorizationInventory(file: string): Phase3AuthorizationInventory {
  const parsed: unknown = JSON.parse(readFileSync(resolve(file), "utf8"));
  if (!isRecord(parsed) || parsed.schemaVersion !== 1) {
    throw new Error("Phase 3 authorization inventory must have schemaVersion 1");
  }
  for (const key of ["apiRoutes", "pageLoaders", "tables", "workersAndCrons"] as const) {
    if (!Array.isArray(parsed[key])) throw new Error(`Phase 3 inventory ${key} must be an array`);
  }
  if (!isRecord(parsed.inventoryCoverage)) {
    throw new Error("Phase 3 inventory coverage metadata must be an object");
  }
  return parsed as unknown as Phase3AuthorizationInventory;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => (seen.has(value) ? true : !seen.add(value)));
}

function setIssues(
  label: string,
  expected: readonly string[],
  actual: readonly string[]
): string[] {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const issues: string[] = [];
  for (const value of [...actualSet].sort()) {
    if (!expectedSet.has(value)) issues.push(`unreviewed ${label}: ${value}`);
  }
  for (const value of [...expectedSet].sort()) {
    if (!actualSet.has(value)) issues.push(`stale ${label}: ${value}`);
  }
  return issues;
}

function drizzleTableNames(schemaSource: string): string[] {
  const source = readFileSync(schemaSource, "utf8");
  return [...source.matchAll(/pgTable\(\s*["']([^"']+)["']/g)].map((match) => match[1]).sort();
}

function discoverPageSources(workspaceRoot: string): string[] {
  const appRoot = resolve(workspaceRoot, "src/app");
  const pages: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name === "page.ts" || entry.name === "page.tsx") {
        pages.push(relative(workspaceRoot, path).split(sep).join("/"));
      }
    }
  };
  visit(appRoot);
  return pages.sort();
}

/**
 * Compare the reviewed, durable matrix to source in both directions. This is
 * intentionally stricter than the frozen Phase 2 fixture: Wave 3 additions or
 * removals must update the authority document in the same integration.
 */
export function phase3AuthorizationInventoryIssues(
  inventory: Phase3AuthorizationInventory,
  workspaceRoot = process.cwd()
): string[] {
  const issues: string[] = [];
  if (!/^[a-f0-9]{40}$/.test(inventory.baselineCommit)) {
    issues.push("authorization inventory baselineCommit must be a full Git SHA");
  }

  const apiSources = [...new Set(inventory.apiRoutes.map(({ source }) => source))];
  const pageSources = inventory.pageLoaders.map(({ source }) => source);
  for (const source of duplicates(pageSources)) issues.push(`duplicate page source: ${source}`);
  const tableNames = inventory.tables.map(({ name }) => name);
  for (const name of duplicates(tableNames)) issues.push(`duplicate table name: ${name}`);
  const workerIds = inventory.workersAndCrons.map(({ id }) => id);
  for (const id of duplicates(workerIds)) issues.push(`duplicate worker id: ${id}`);

  const actualRouteSurfaces = discoverNextRouteSurfaces(resolve(workspaceRoot, "src/app/api"));
  const expectedRouteSurfaces = inventory.apiRoutes.flatMap((entry) =>
    entry.methods.map((method) => `${method} ${entry.path}`)
  );
  for (const surface of duplicates(expectedRouteSurfaces)) {
    issues.push(`duplicate API route surface: ${surface}`);
  }
  issues.push(...setIssues("API route surface", expectedRouteSurfaces, actualRouteSurfaces));

  for (const entry of inventory.apiRoutes) {
    if (!existsSync(resolve(workspaceRoot, entry.source))) {
      issues.push(`missing API source: ${entry.source}`);
    }
    if (routePathFromSource(entry.source) !== entry.path) {
      issues.push(`API source/path mismatch: ${entry.source} -> ${entry.path}`);
    }
    if (entry.methods.length === 0 || duplicates(entry.methods).length > 0) {
      issues.push(`API methods are empty or duplicated: ${entry.source}`);
    }
    if (!entry.scope || !entry.testProfile || !entry.requiredPrincipal) {
      issues.push(`API authorization policy is incomplete: ${entry.source}`);
    }
    const allowedScopesByProfile: Record<string, readonly string[]> = {
      public: ["public"],
      owner: ["owner"],
      captureCreate: ["capture-create"],
      service: ["service", "service-fanout"],
      platformAdmin: ["platform"],
    };
    if (!allowedScopesByProfile[entry.testProfile]?.includes(entry.scope)) {
      issues.push(
        `API scope/profile mismatch: ${entry.methods.join(",")} ${entry.path} is ${entry.scope}/${entry.testProfile}`
      );
    }
    if (entry.path.startsWith("/api/admin/") && entry.testProfile !== "platformAdmin") {
      issues.push(`admin API lacks platform-admin policy: ${entry.path}`);
    }
  }

  const actualPages = discoverPageSources(workspaceRoot);
  issues.push(...setIssues("page source", pageSources, actualPages));
  for (const entry of inventory.pageLoaders) {
    if (pagePathFromSource(entry.source) !== entry.path) {
      issues.push(`page source/path mismatch: ${entry.source} -> ${entry.path}`);
    }
    if (!entry.testProfile) issues.push(`page authorization policy is incomplete: ${entry.source}`);
  }

  const actualTables = drizzleTableNames(resolve(workspaceRoot, "src/lib/postgres/schema.ts"));
  issues.push(...setIssues("Drizzle table", tableNames, actualTables));
  for (const table of inventory.tables) {
    if (!table.requiredScope) issues.push(`table ownership policy is incomplete: ${table.name}`);
  }
  for (const worker of inventory.workersAndCrons) {
    if (!existsSync(resolve(workspaceRoot, worker.source)))
      issues.push(`missing worker source: ${worker.source}`);
    if (!worker.requiredTenant) issues.push(`worker tenant policy is incomplete: ${worker.id}`);
  }

  if (inventory.inventoryCoverage.expectedApiRouteFileCount !== apiSources.length) {
    issues.push("expectedApiRouteFileCount does not match reviewed API sources");
  }
  if (inventory.inventoryCoverage.expectedPageFileCount !== pageSources.length) {
    issues.push("expectedPageFileCount does not match reviewed page sources");
  }
  if (inventory.inventoryCoverage.expectedDrizzleTableCount !== tableNames.length) {
    issues.push("expectedDrizzleTableCount does not match reviewed tables");
  }
  return [...new Set(issues)];
}

export function assertPhase3AuthorizationInventory(
  inventory: Phase3AuthorizationInventory,
  workspaceRoot = process.cwd()
): void {
  const issues = phase3AuthorizationInventoryIssues(inventory, workspaceRoot);
  if (issues.length > 0) {
    throw new Error(`Phase 3 authorization inventory failed:\n- ${issues.join("\n- ")}`);
  }
}

/** Cookie-authenticated owner mutations drive the generated CSRF adapter suite. */
export function reviewedOwnerMutationSurfaces(inventory: Phase3AuthorizationInventory): string[] {
  return inventory.apiRoutes
    .filter(({ scope, testProfile }) => scope === "owner" && testProfile === "owner")
    .flatMap((entry) =>
      entry.methods
        .filter((method) => unsafeMethods.has(method))
        .map((method) => `${method} ${entry.path}`)
    )
    .sort();
}

export function loadCsrfRouteExemptions(file: string): CsrfRouteExemption[] {
  const parsed: unknown = JSON.parse(readFileSync(resolve(file), "utf8"));
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.exemptions)) {
    throw new Error("CSRF route exemptions must have version 1 and an exemptions array");
  }
  for (const [index, exemption] of parsed.exemptions.entries()) {
    if (
      !isRecord(exemption) ||
      typeof exemption.surface !== "string" ||
      typeof exemption.reason !== "string" ||
      (exemption.control !== "dormant-no-side-effect" &&
        exemption.control !== "composed-principal-origin")
    ) {
      throw new Error(`Invalid CSRF exemption at index ${index}`);
    }
  }
  return parsed.exemptions as CsrfRouteExemption[];
}

/**
 * Static review companion to generated runtime cases. It recognizes only the
 * central origin helpers or two narrow, source-verifiable exceptions.
 */
export function mutationOriginProtectionIssues(
  inventory: Phase3AuthorizationInventory,
  exemptions: readonly CsrfRouteExemption[],
  workspaceRoot = process.cwd()
): string[] {
  const issues: string[] = [];
  const mutations = reviewedOwnerMutationSurfaces(inventory);
  const mutationSet = new Set(mutations);
  const exemptionMap = new Map(exemptions.map((entry) => [entry.surface, entry]));
  if (exemptionMap.size !== exemptions.length) issues.push("duplicate CSRF exemption surface");

  for (const exemption of exemptions) {
    if (!mutationSet.has(exemption.surface)) {
      issues.push(`stale CSRF exemption: ${exemption.surface}`);
    }
    if (exemption.reason.trim().length < 12) {
      issues.push(`CSRF exemption needs a specific reason: ${exemption.surface}`);
    }
  }

  for (const surface of mutations) {
    const separator = surface.indexOf(" ");
    const method = surface.slice(0, separator);
    const path = surface.slice(separator + 1);
    const entry = inventory.apiRoutes.find(
      (candidate) => candidate.path === path && candidate.methods.includes(method)
    );
    if (!entry) {
      issues.push(`mutation has no authorization entry: ${surface}`);
      continue;
    }
    const source = readFileSync(resolve(workspaceRoot, entry.source), "utf8");
    if (/\b(?:requireAllowedOrigin|requireSessionMutation)\s*\(/.test(source)) continue;
    const exemption = exemptionMap.get(surface);
    if (exemption?.control === "dormant-no-side-effect") {
      if (!/\brequireDormantConnectorRoute\s*\(/.test(source)) {
        issues.push(`dormant CSRF exemption no longer fails closed: ${surface}`);
      }
      continue;
    }
    if (exemption?.control === "composed-principal-origin") {
      if (!/\bcomposeCaptureRoutes\s*\(/.test(source)) {
        issues.push(`composed CSRF exemption lost its origin-aware principal: ${surface}`);
      }
      continue;
    }
    issues.push(`cookie-authenticated mutation has no route origin check: ${surface}`);
  }
  return issues;
}
