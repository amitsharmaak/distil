import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { AuthContext } from "./phase3-tenancy";

export type AuthorizationActorKind = AuthContext["actorKind"];
export type AuthorizationDecision = "deny" | "own" | "allow";
export type AuthorizationResourceScope = "public" | "user" | "system";
export type AuthorizationSurfaceKind = "route" | "worker";

export interface AuthorizationMatrixEntry {
  id: string;
  surface: string;
  surfaceKind: AuthorizationSurfaceKind;
  resourceScope: AuthorizationResourceScope;
  unauthenticated: "allow" | "deny";
  actors: Record<AuthorizationActorKind, AuthorizationDecision>;
  concealCrossTenant: boolean;
  notes?: string;
}

export interface AuthorizationMatrix {
  version: 1;
  entries: AuthorizationMatrixEntry[];
}

const actorKinds: AuthorizationActorKind[] = ["user", "capture-token", "system"];
const decisions: AuthorizationDecision[] = ["deny", "own", "allow"];
const scopes: AuthorizationResourceScope[] = ["public", "user", "system"];
const surfaceKinds: AuthorizationSurfaceKind[] = ["route", "worker"];
const routeMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  field: string,
  issues: string[],
  index: number
): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push(`entries[${index}].${field} must be a non-empty string`);
    return undefined;
  }
  return value;
}

/** Return every structural or security-semantic problem in a matrix. */
export function validateAuthorizationMatrix(input: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(input)) return ["authorization matrix must be an object"];
  if (input.version !== 1) issues.push("authorization matrix version must be 1");
  if (!Array.isArray(input.entries))
    return [...issues, "authorization matrix entries must be an array"];

  const ids = new Set<string>();
  const surfaces = new Set<string>();

  input.entries.forEach((raw, index) => {
    if (!isRecord(raw)) {
      issues.push(`entries[${index}] must be an object`);
      return;
    }

    const id = requiredString(raw.id, "id", issues, index);
    const surface = requiredString(raw.surface, "surface", issues, index);
    if (id) {
      if (ids.has(id)) issues.push(`duplicate authorization entry id: ${id}`);
      ids.add(id);
    }
    if (surface) {
      if (surfaces.has(surface)) issues.push(`duplicate authorization surface: ${surface}`);
      surfaces.add(surface);
    }

    if (!surfaceKinds.includes(raw.surfaceKind as AuthorizationSurfaceKind)) {
      issues.push(`entries[${index}].surfaceKind must be route or worker`);
    }
    if (!scopes.includes(raw.resourceScope as AuthorizationResourceScope)) {
      issues.push(`entries[${index}].resourceScope is invalid`);
    }
    if (raw.unauthenticated !== "allow" && raw.unauthenticated !== "deny") {
      issues.push(`entries[${index}].unauthenticated must be allow or deny`);
    }
    if (typeof raw.concealCrossTenant !== "boolean") {
      issues.push(`entries[${index}].concealCrossTenant must be boolean`);
    }

    if (raw.surfaceKind === "route" && surface) {
      const method = surface.split(" ", 1)[0];
      if (!routeMethods.includes(method) || !/^\w+ \/api(?:\/|$)/.test(surface)) {
        issues.push(`route surface must use METHOD /api/path form: ${surface}`);
      }
    }
    if (raw.surfaceKind === "worker" && surface && !surface.startsWith("worker:")) {
      issues.push(`worker surface must start with worker: ${surface}`);
    }

    if (!isRecord(raw.actors)) {
      issues.push(`entries[${index}].actors must define every actor kind`);
    } else {
      for (const actorKind of actorKinds) {
        if (!decisions.includes(raw.actors[actorKind] as AuthorizationDecision)) {
          issues.push(`entries[${index}].actors.${actorKind} is invalid`);
        }
      }
      const unexpected = Object.keys(raw.actors).filter(
        (actorKind) => !actorKinds.includes(actorKind as AuthorizationActorKind)
      );
      if (unexpected.length > 0) {
        issues.push(`entries[${index}].actors has unexpected keys: ${unexpected.join(", ")}`);
      }
    }

    const tenantBound = raw.resourceScope === "user";
    if (tenantBound && raw.unauthenticated === "allow") {
      issues.push(`tenant-bound surface cannot allow unauthenticated access: ${surface ?? index}`);
    }
    if (tenantBound && raw.concealCrossTenant !== true) {
      issues.push(`tenant-bound surface must conceal cross-tenant existence: ${surface ?? index}`);
    }
    if (tenantBound && isRecord(raw.actors)) {
      for (const actorKind of ["user", "capture-token"] satisfies AuthorizationActorKind[]) {
        if (raw.actors[actorKind] === "allow") {
          issues.push(
            `tenant-bound ${actorKind} decision must be own or deny, not allow: ${surface ?? index}`
          );
        }
      }
    }
    if (raw.surfaceKind === "worker" && raw.unauthenticated !== "deny") {
      issues.push(`workers cannot allow unauthenticated invocation: ${surface ?? index}`);
    }
  });

  return issues;
}

export function assertValidAuthorizationMatrix(
  input: unknown
): asserts input is AuthorizationMatrix {
  const issues = validateAuthorizationMatrix(input);
  if (issues.length > 0) {
    throw new Error(`Invalid authorization matrix:\n- ${issues.join("\n- ")}`);
  }
}

export function loadAuthorizationMatrix(file: string): AuthorizationMatrix {
  const parsed: unknown = JSON.parse(readFileSync(resolve(file), "utf8"));
  assertValidAuthorizationMatrix(parsed);
  return parsed;
}

/** Load the frozen Phase 2 + Wave 0 route inventory without assigning trust at runtime. */
export function loadRouteSurfaceInventory(file: string): string[] {
  const parsed: unknown = JSON.parse(readFileSync(resolve(file), "utf8"));
  if (!Array.isArray(parsed) || !parsed.every((surface) => typeof surface === "string")) {
    throw new Error("Route surface inventory must be a JSON array of strings");
  }
  const surfaces = [...parsed].sort();
  if (new Set(surfaces).size !== surfaces.length) {
    throw new Error("Route surface inventory contains duplicate surfaces");
  }
  for (const surface of surfaces) {
    const method = surface.split(" ", 1)[0];
    if (!routeMethods.includes(method) || !/^\w+ \/api(?:\/|$)/.test(surface)) {
      throw new Error(`Invalid route surface inventory entry: ${surface}`);
    }
  }
  return surfaces;
}

/** Missing and stale routes are both breaking changes to the authorization review. */
export function routeSurfaceInventoryIssues(
  inventory: readonly string[],
  discovered: readonly string[]
): string[] {
  const expected = new Set(inventory);
  const actual = new Set(discovered);
  const issues: string[] = [];
  for (const surface of [...actual].sort()) {
    if (!expected.has(surface)) issues.push(`unreviewed route surface: ${surface}`);
  }
  for (const surface of [...expected].sort()) {
    if (!actual.has(surface)) issues.push(`removed route surface: ${surface}`);
  }
  return issues;
}

export function assertRouteSurfaceInventory(
  inventory: readonly string[],
  discovered: readonly string[]
): void {
  const issues = routeSurfaceInventoryIssues(inventory, discovered);
  if (issues.length > 0) throw new Error(`Route inventory failed:\n- ${issues.join("\n- ")}`);
}

const publicRouteSurfaces = new Set([
  "GET /api/health",
  "GET /api/auth/gmail",
  "GET /api/auth/gmail/callback",
  "GET /api/auth/slack",
  "GET /api/auth/slack/callback",
  "GET /api/auth/:path+",
  "GET /api/auth/invitations/complete",
  "GET /api/auth/sign-in/complete",
  "POST /api/auth/login",
  "POST /api/auth/:path+",
  "POST /api/auth/invitations/request-link",
  "POST /api/auth/sign-in/request-link",
]);

const systemRouteSurfaces = new Set(["GET /api/cron/digests"]);
const workerSurfaces = ["worker:capture", "worker:durable-job"] as const;

function matrixId(surface: string): string {
  return `phase2-wave0-${surface
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")}`;
}

/**
 * Generate the reviewed Phase 2 / Wave 0 least-privilege matrix. The explicit
 * inventory, rather than route discovery alone, prevents new APIs from gaining
 * a permissive default without a matrix review.
 */
export function createPhase2Wave0AuthorizationMatrix(
  routeSurfaces: readonly string[]
): AuthorizationMatrix {
  const entries: AuthorizationMatrixEntry[] = routeSurfaces.map((surface) => {
    if (publicRouteSurfaces.has(surface) || surface.startsWith("OPTIONS ")) {
      return {
        id: matrixId(surface),
        surface,
        surfaceKind: "route",
        resourceScope: "public",
        unauthenticated: "allow",
        actors: { user: "allow", "capture-token": "allow", system: "allow" },
        concealCrossTenant: false,
      };
    }
    if (systemRouteSurfaces.has(surface)) {
      return {
        id: matrixId(surface),
        surface,
        surfaceKind: "route",
        resourceScope: "system",
        unauthenticated: "deny",
        actors: { user: "deny", "capture-token": "deny", system: "allow" },
        concealCrossTenant: false,
      };
    }
    if (surface === "POST /api/queue/capture-requests") {
      return {
        id: matrixId(surface),
        surface,
        surfaceKind: "route",
        resourceScope: "user",
        unauthenticated: "deny",
        actors: { user: "deny", "capture-token": "deny", system: "own" },
        concealCrossTenant: true,
      };
    }
    return {
      id: matrixId(surface),
      surface,
      surfaceKind: "route",
      resourceScope: "user",
      unauthenticated: "deny",
      actors: { user: "own", "capture-token": "deny", system: "deny" },
      concealCrossTenant: true,
    };
  });
  entries.push(
    ...workerSurfaces.map((surface) => ({
      id: matrixId(surface),
      surface,
      surfaceKind: "worker" as const,
      resourceScope: "user" as const,
      unauthenticated: "deny" as const,
      actors: { user: "deny" as const, "capture-token": "deny" as const, system: "own" as const },
      concealCrossTenant: true,
    }))
  );
  const matrix = { version: 1 as const, entries };
  assertValidAuthorizationMatrix(matrix);
  return matrix;
}

export function phase2Wave0WorkerSurfaces(): readonly string[] {
  return workerSurfaces;
}

/**
 * Fail when a route/worker is absent or when the matrix retains a removed
 * surface. Passing both directions prevents new endpoints from silently
 * defaulting to an authorization behavior.
 */
export function authorizationCoverageIssues(
  matrix: AuthorizationMatrix,
  expectedSurfaces: readonly string[]
): string[] {
  const actual = new Set(matrix.entries.map(({ surface }) => surface));
  const expected = new Set(expectedSurfaces);
  const issues: string[] = [];

  for (const surface of [...expected].sort()) {
    if (!actual.has(surface)) issues.push(`missing authorization surface: ${surface}`);
  }
  for (const surface of [...actual].sort()) {
    if (!expected.has(surface)) issues.push(`stale authorization surface: ${surface}`);
  }
  return issues;
}

export function assertAuthorizationCoverage(
  matrix: AuthorizationMatrix,
  expectedSurfaces: readonly string[]
): void {
  const issues = authorizationCoverageIssues(matrix, expectedSurfaces);
  if (issues.length > 0)
    throw new Error(`Authorization coverage failed:\n- ${issues.join("\n- ")}`);
}

function routeSegment(segment: string): string {
  const optionalCatchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/);
  if (optionalCatchAll) return `:${optionalCatchAll[1]}*`;
  const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
  if (catchAll) return `:${catchAll[1]}+`;
  const dynamic = segment.match(/^\[(.+)\]$/);
  return dynamic ? `:${dynamic[1]}` : segment;
}

/** Discover exported Next route handlers and normalize dynamic path names. */
export function discoverNextRouteSurfaces(apiDirectory: string): string[] {
  const root = resolve(apiDirectory);
  const files: string[] = [];

  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name === "route.ts" || entry.name === "route.tsx") files.push(path);
    }
  };
  visit(root);

  return files
    .flatMap((file) => {
      const source = readFileSync(file, "utf8");
      const methods = new Set<string>();
      const matcher =
        /export\s+(?:(?:async\s+)?function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
      for (const match of source.matchAll(matcher)) methods.add(match[1]);
      const relativeFile = relative(root, file).split(sep);
      relativeFile.pop();
      const path = ["api", ...relativeFile.map(routeSegment)].join("/");
      return [...methods].map((method) => `${method} /${path}`);
    })
    .sort();
}
