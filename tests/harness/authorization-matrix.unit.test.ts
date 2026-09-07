import { resolve } from "node:path";
import {
  assertAuthorizationCoverage,
  assertRouteSurfaceInventory,
  authorizationCoverageIssues,
  createPhase2Wave0AuthorizationMatrix,
  discoverNextRouteSurfaces,
  loadAuthorizationMatrix,
  loadRouteSurfaceInventory,
  phase2Wave0WorkerSurfaces,
  routeSurfaceInventoryIssues,
  validateAuthorizationMatrix,
} from "../support/authorization-matrix";
import {
  loadNegativeTestCatalog,
  validateNegativeTestCatalog,
} from "../support/negative-test-catalog";

const fixtureDirectory = resolve(__dirname, "../fixtures/phase3");

describe("Phase 3 authorization matrix", () => {
  it("loads a valid test matrix", () => {
    const matrix = loadAuthorizationMatrix(
      resolve(fixtureDirectory, "authorization-matrix.valid.json")
    );

    expect(matrix.entries.map(({ surface }) => surface)).toEqual([
      "POST /api/v1/captures",
      "worker:capture",
    ]);
    expect(() =>
      assertAuthorizationCoverage(matrix, ["POST /api/v1/captures", "worker:capture"])
    ).not.toThrow();
  });

  it("rejects unsafe tenant semantics and duplicate surfaces", () => {
    const unsafe = {
      version: 1,
      entries: [
        {
          id: "unsafe",
          surface: "GET /api/items/:id",
          surfaceKind: "route",
          resourceScope: "user",
          unauthenticated: "allow",
          actors: { user: "allow", "capture-token": "deny", system: "allow" },
          concealCrossTenant: false,
        },
        {
          id: "duplicate",
          surface: "GET /api/items/:id",
          surfaceKind: "route",
          resourceScope: "public",
          unauthenticated: "allow",
          actors: { user: "allow", "capture-token": "allow", system: "allow" },
          concealCrossTenant: false,
        },
      ],
    };

    expect(validateAuthorizationMatrix(unsafe)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("duplicate authorization surface"),
        expect.stringContaining("cannot allow unauthenticated"),
        expect.stringContaining("must conceal cross-tenant existence"),
        expect.stringContaining("must be own or deny"),
      ])
    );
  });

  it("reports both newly uncovered and stale surfaces", () => {
    const matrix = loadAuthorizationMatrix(
      resolve(fixtureDirectory, "authorization-matrix.valid.json")
    );

    expect(
      authorizationCoverageIssues(matrix, ["POST /api/v1/captures", "GET /api/health"])
    ).toEqual([
      "missing authorization surface: GET /api/health",
      "stale authorization surface: worker:capture",
    ]);
  });

  it("discovers route methods and normalizes dynamic Next.js paths", () => {
    const surfaces = discoverNextRouteSurfaces(resolve(process.cwd(), "src/app/api"));

    expect(surfaces).toEqual(
      expect.arrayContaining([
        "GET /api/health",
        "GET /api/v1/captures/:id",
        "DELETE /api/v1/collections/:id/items/:itemId",
      ])
    );
  });

  it("locks the final Phase 2 plus Wave 0 API inventory into a least-privilege matrix", () => {
    const inventory = loadRouteSurfaceInventory(
      resolve(fixtureDirectory, "phase2-wave0-route-surfaces.json")
    );
    const discovered = discoverNextRouteSurfaces(resolve(process.cwd(), "src/app/api"));
    const matrix = createPhase2Wave0AuthorizationMatrix(inventory);

    expect(inventory).toHaveLength(96);
    expect(() => assertRouteSurfaceInventory(inventory, discovered)).not.toThrow();
    expect(() =>
      assertAuthorizationCoverage(matrix, [...inventory, ...phase2Wave0WorkerSurfaces()])
    ).not.toThrow();
    expect(matrix.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surface: "GET /api/v1/captures/:id",
          resourceScope: "user",
          concealCrossTenant: true,
        }),
        expect.objectContaining({
          surface: "POST /api/queue/capture-requests",
          actors: expect.objectContaining({ system: "own", user: "deny" }),
        }),
      ])
    );
  });

  it("reports an unreviewed API surface rather than silently applying a default", () => {
    const inventory = ["GET /api/health"];
    expect(
      routeSurfaceInventoryIssues(inventory, ["GET /api/health", "POST /api/new-surface"])
    ).toEqual(["unreviewed route surface: POST /api/new-surface"]);
  });
});

describe("Phase 3 negative-test catalog", () => {
  it("loads unique cases spanning the database and queue boundaries", () => {
    const catalog = loadNegativeTestCatalog(
      resolve(fixtureDirectory, "negative-test-catalog.json")
    );

    expect(catalog.entries.length).toBeGreaterThanOrEqual(12);
    expect(new Set(catalog.entries.map(({ id }) => id)).size).toBe(catalog.entries.length);
    expect(catalog.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ layer: "database", delivery: "wave-1-gate" }),
        expect.objectContaining({ layer: "queue", delivery: "wave-1-gate" }),
        expect.objectContaining({ layer: "ai-context" }),
      ])
    );
  });

  it("rejects catalogs without mandatory database and queue cases", () => {
    expect(validateNegativeTestCatalog({ version: 1, entries: [] })).toEqual([
      "negative-test catalog must include a database isolation case",
      "negative-test catalog must include a forged queue case",
    ]);
  });
});
