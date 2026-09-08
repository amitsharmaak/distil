import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertPhase3AuthorizationInventory,
  loadCsrfRouteExemptions,
  loadNeonCsrfBoundaryReview,
  loadPhase3AuthorizationInventory,
  mutationOriginProtectionIssues,
  neonCsrfBoundaryIssues,
  phase3AuthorizationInventoryIssues,
  reviewedOwnerMutationSurfaces,
} from "../support/phase3-authorization-inventory";

const matrixPath = resolve(process.cwd(), "docs/authorization-matrix.json");
const csrfBoundaryPath = resolve(process.cwd(), "tests/fixtures/phase3/neon-csrf-boundary.json");

describe("Phase 3 durable authorization inventory", () => {
  it("matches every frozen Wave 2 route, page, and Drizzle table in both directions", () => {
    const inventory = loadPhase3AuthorizationInventory(matrixPath);
    expect(inventory.baselineCommit).toBe("428a0b023e2295b59fe864efeb2b26047b0ed6fa");
    expect(inventory.tables).toHaveLength(49);
    expect(new Set(inventory.apiRoutes.map(({ source }) => source))).toHaveProperty("size", 83);
    expect(inventory.pageLoaders).toHaveLength(20);
    expect(() => assertPhase3AuthorizationInventory(inventory)).not.toThrow();
  });

  it("turns every reviewed owner mutation into generated CSRF coverage", () => {
    const surfaces = reviewedOwnerMutationSurfaces(loadPhase3AuthorizationInventory(matrixPath));
    expect(surfaces).toHaveLength(52);
    expect(surfaces).toEqual(
      expect.arrayContaining([
        "POST /api/agent/approvals",
        "DELETE /api/auth/devices/:id",
        "POST /api/v1/items/:id/summaries/regenerate",
      ])
    );
  });

  it("allows only source-verifiable CSRF exceptions and reports unprotected mutations", () => {
    const inventory = loadPhase3AuthorizationInventory(matrixPath);
    const exemptions = loadCsrfRouteExemptions(
      resolve(process.cwd(), "tests/fixtures/phase3/csrf-route-exemptions.json")
    );
    const boundary = loadNeonCsrfBoundaryReview(csrfBoundaryPath);
    expect(exemptions).toHaveLength(7);
    expect(boundary.centrallyProtectedSurfaces).toHaveLength(17);
    expect(neonCsrfBoundaryIssues(boundary, inventory)).toEqual([]);
    expect(mutationOriginProtectionIssues(inventory, exemptions, boundary)).toEqual([]);
  });

  it("fails closed when the reviewed central CSRF source digest drifts", () => {
    const inventory = loadPhase3AuthorizationInventory(matrixPath);
    const exemptions = loadCsrfRouteExemptions(
      resolve(process.cwd(), "tests/fixtures/phase3/csrf-route-exemptions.json")
    );
    const boundary = {
      ...loadNeonCsrfBoundaryReview(csrfBoundaryPath),
      sha256: "0".repeat(64),
    };
    const issues = mutationOriginProtectionIssues(inventory, exemptions, boundary);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Neon CSRF boundary digest drift"),
        "cookie-authenticated mutation has no route origin check: POST /api/ai/summarize",
      ])
    );
  });

  it("reports additions and removals instead of assigning default policy", () => {
    const inventory = loadPhase3AuthorizationInventory(matrixPath);
    const modified = structuredClone(inventory);
    modified.apiRoutes = modified.apiRoutes.filter(
      ({ source }) => source !== "src/app/api/health/route.ts"
    );
    modified.apiRoutes.push({
      path: "/api/stale",
      source: "src/app/api/stale/route.ts",
      methods: ["GET"],
      scope: "public",
      testProfile: "public",
    });
    expect(phase3AuthorizationInventoryIssues(modified)).toEqual(
      expect.arrayContaining([
        "unreviewed API route surface: GET /api/health",
        "stale API route surface: GET /api/stale",
        "missing API source: src/app/api/stale/route.ts",
      ])
    );
  });

  it("locks the integration-owned Wave 3 lifecycle route and worker names", () => {
    const fixture = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "tests/fixtures/phase3/wave3-lifecycle-surfaces.json"),
        "utf8"
      )
    ) as { version: number; routes: string[]; workers: string[] };
    expect(fixture).toEqual({
      version: 1,
      routes: [
        "POST /api/v1/account/export",
        "GET /api/v1/account/exports/:id",
        "GET /api/v1/account/exports/:id/download",
        "POST /api/v1/account/deletion",
        "DELETE /api/v1/account/deletion",
        "GET /api/v1/account/usage",
      ],
      workers: ["worker:account-export", "worker:account-deletion"],
    });
    expect(new Set([...fixture.routes, ...fixture.workers])).toHaveProperty(
      "size",
      fixture.routes.length + fixture.workers.length
    );
  });
});
