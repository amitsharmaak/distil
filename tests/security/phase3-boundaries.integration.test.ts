import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

jest.mock("@/lib/auth/tenant-route", () => ({ requireTenantRoute: jest.fn() }));

import { requireTenantRoute } from "@/lib/auth/tenant-route";
import { requireDormantConnectorRoute } from "@/lib/connectors/route-gate";
import { createAuthContext } from "@/lib/contracts/tenant-context";
import {
  createCaptureQueueMessageV2,
  createTenantJobEnvelopeV1,
} from "@/lib/contracts/tenant-jobs";
import { CaptureWorker } from "@/lib/capture/worker";
import { consumeTenantJobEnvelope } from "@/lib/jobs/tenant-runtime";
import { withTenantTransaction } from "@/lib/postgres/tenant-repositories";
import type { Sql } from "postgres";

import { createTwoTenantFixture } from "../support/phase3-tenancy";

const fixture = createTwoTenantFixture();

function sessionContext(tenant: (typeof fixture)["alpha"]) {
  return createAuthContext({
    userId: tenant.user.id,
    actorKind: "user",
    actorId: tenant.user.id,
    requestId: tenant.auth.session.requestId,
  });
}

function sqlDouble(context = sessionContext(fixture.alpha)) {
  const settings: unknown[][] = [];
  const sql = jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join("?");
    if (query.includes("set_config('app.user_id'")) settings.push(values);
    if (query.includes("current_setting('app.user_id'")) {
      return [
        {
          user_id: context.userId,
          actor_id: context.actorId,
          actor_kind: context.actorKind,
          request_id: context.requestId,
          environment: "runtime",
          search_path: "tenant_api, pg_catalog",
        },
      ];
    }
    return [];
  }) as unknown as Sql;
  Object.assign(sql, {
    begin: jest.fn(async (operation: (transaction: Sql) => Promise<unknown>) => operation(sql)),
    savepoint: jest.fn(async (operation: (transaction: Sql) => Promise<unknown>) => operation(sql)),
  });
  return { sql, settings };
}

describe("Phase 3 boundary gates", () => {
  beforeEach(() => jest.clearAllMocks());

  it("P3-ROUTE-001: authenticates every dormant connector request before returning the same 404", async () => {
    jest.mocked(requireTenantRoute).mockResolvedValue({} as never);

    const crossTenant = await requireDormantConnectorRoute(
      new Request("https://distil.example/api/auth/gmail/status")
    );
    const unknown = await requireDormantConnectorRoute(
      new Request("https://distil.example/api/auth/unknown/status")
    );

    expect(crossTenant.status).toBe(404);
    expect(await crossTenant.json()).toEqual(await unknown.json());
    expect(requireTenantRoute).toHaveBeenCalledTimes(2);
  });

  it("P3-REPO-001: establishes a fresh transaction-local identity for each tenant", async () => {
    const alphaContext = sessionContext(fixture.alpha);
    const betaContext = sessionContext(fixture.beta);
    const alpha = sqlDouble(alphaContext);
    const beta = sqlDouble(betaContext);

    await withTenantTransaction(alpha.sql, alphaContext, async () => undefined);
    await withTenantTransaction(beta.sql, betaContext, async () => undefined);

    expect(alpha.settings).toEqual([
      expect.arrayContaining([fixture.alpha.user.id, alphaContext.actorId, alphaContext.requestId]),
    ]);
    expect(beta.settings).toEqual([
      expect.arrayContaining([fixture.beta.user.id, betaContext.actorId, betaContext.requestId]),
    ]);
    expect(alpha.settings[0]).not.toEqual(beta.settings[0]);
  });

  it("P3-QUEUE-001/P3-QUEUE-002: rejects forged capture and job owners before a handler runs", async () => {
    const captureAudit = jest.fn();
    const captures = { findById: jest.fn(), transition: jest.fn() };
    const captureWorker = new CaptureWorker({
      context: sessionContext(fixture.alpha),
      captures: captures as never,
      processor: jest.fn(),
      audit: captureAudit,
    });
    const forgedCapture = createCaptureQueueMessageV2({
      userId: fixture.beta.user.id,
      captureId: fixture.alpha.resources.captureId,
      traceId: fixture.alpha.auth.session.requestId,
    });

    await expect(captureWorker.handle(forgedCapture)).resolves.toBeUndefined();
    expect(captures.findById).not.toHaveBeenCalled();
    expect(captureAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "capture_queue_owner_mismatch_or_missing" })
    );

    const handler = jest.fn();
    const repositories = {
      jobs: { claim: jest.fn().mockResolvedValue(undefined) },
      agent: { insertAuditLog: jest.fn() },
    };
    const forgedJob = createTenantJobEnvelopeV1({
      userId: fixture.beta.user.id,
      jobId: fixture.alpha.resources.jobId,
      jobType: "capture.enrich",
      traceId: fixture.alpha.auth.system.requestId,
    });

    await expect(
      consumeTenantJobEnvelope(forgedJob, {
        getTenantRepositories: jest.fn().mockResolvedValue(repositories),
        handlers: new Map([["capture.enrich", handler]]),
      })
    ).resolves.toBe("rejected");
    expect(handler).not.toHaveBeenCalled();
  });

  it("P3-DB-003: tenant-relative unique keys permit the same public values for unrelated users", async () => {
    const contract = await readFile(
      resolve(process.cwd(), "src/lib/postgres/tenant-migrations/0007_phase3_tenant_contract.sql"),
      "utf8"
    );

    expect(contract).toContain("ON items(user_id, normalized_url)");
    expect(contract).toContain("ON capture_requests(user_id, normalized_url)");
    expect(contract).toContain("ON digest_runs(user_id, local_date)");
    expect(contract).toContain("PRIMARY KEY (user_id, id)");
  });
});
