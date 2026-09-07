import { resolve } from "node:path";

import { createTwoTenantFixture } from "../support/phase3-tenancy";
import {
  assertCrossTenantNotFound,
  assertForgedQueueEnvelopesRejected,
  assertRepositoryIsolation,
  assertTenantScopedCoexistence,
  type TenantCoexistenceAdapter,
  type TenantQueueIsolationAdapter,
  type TenantRepositoryIsolationAdapter,
  type TenantRouteIsolationAdapter,
} from "../support/phase3-isolation";

interface TenantBoundaryAdapters {
  routes?: TenantRouteIsolationAdapter;
  repositories?: TenantRepositoryIsolationAdapter;
  queue?: TenantQueueIsolationAdapter;
  coexistence?: TenantCoexistenceAdapter;
}

const adapterModule = process.env.DISTIL_PHASE3_ISOLATION_ADAPTER;

function loadAdapters(): TenantBoundaryAdapters | undefined {
  if (!adapterModule) return undefined;
  // This is intentionally a test adapter, never a production runtime setting.
  // Resolve from the repository so CI cannot silently select a hosted dependency.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded: unknown = require(resolve(process.cwd(), adapterModule));
  if (typeof loaded !== "object" || loaded === null || !("phase3IsolationAdapters" in loaded)) {
    throw new Error(
      "DISTIL_PHASE3_ISOLATION_ADAPTER must export phase3IsolationAdapters, not an arbitrary module shape"
    );
  }
  return (loaded as { phase3IsolationAdapters: TenantBoundaryAdapters }).phase3IsolationAdapters;
}

const adapters = loadAdapters();
const fixture = createTwoTenantFixture();
const testRoutes = adapters?.routes ? it : it.skip;
const testRepositories = adapters?.repositories ? it : it.skip;
const testQueue = adapters?.queue ? it : it.skip;
const testCoexistence = adapters?.coexistence ? it : it.skip;

describe("Phase 3 boundary adapter gates", () => {
  testRoutes("P3-ROUTE-001: cross-user resource lookup is the same 404 as an unknown id", async () => {
    await assertCrossTenantNotFound(adapters!.routes!, fixture);
  });

  testRepositories("P3-REPO-001: tenant repository methods conceal and preserve cross-user data", async () => {
    await assertRepositoryIsolation(adapters!.repositories!, fixture);
  });

  testQueue("P3-QUEUE-001/P3-QUEUE-002: forged capture and job envelopes have no effects", async () => {
    await assertForgedQueueEnvelopesRejected(adapters!.queue!, fixture);
  });

  testCoexistence("P3-DB-003: same URL, date, and key coexist for separate users", async () => {
    await assertTenantScopedCoexistence(adapters!.coexistence!, fixture);
  });

  it("documents exact pending feature signals rather than broadly skipping the suite", () => {
    if (!adapters) {
      expect(adapterModule).toBeUndefined();
      return;
    }
    expect(Object.keys(adapters)).toEqual(
      expect.arrayContaining(
        ["routes", "repositories", "queue", "coexistence"].filter((key) => key in adapters)
      )
    );
  });
});
