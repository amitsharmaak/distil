import type { CaptureQueueMessageV2, TenantJobEnvelopeV1 } from "@/lib/contracts/tenant-jobs";
import type { AuthContext, TenantFixture, TwoTenantFixture } from "./phase3-tenancy";
import { forgedQueueEnvelopeFixtures } from "./phase3-tenancy";

export interface TenantRouteResponse {
  readonly status: number;
  readonly body: unknown;
}

/** Adapter production route tests provide once authenticated route composition exists. */
export interface TenantRouteIsolationAdapter {
  readonly unknownResourceId: string;
  getItem(context: AuthContext, itemId: string): Promise<TenantRouteResponse>;
}

/** Adapter repository integration tests provide once tenant context is mandatory. */
export interface TenantRepositoryIsolationAdapter {
  seed(fixture: TwoTenantFixture): Promise<void>;
  listItemIds(context: AuthContext): Promise<readonly string[]>;
  findItem(context: AuthContext, itemId: string): Promise<{ id: string } | null>;
  updateItem(context: AuthContext, itemId: string): Promise<boolean>;
  deleteItem(context: AuthContext, itemId: string): Promise<boolean>;
}

/** Adapter queue tests provide once V2 capture and durable-job consumers ship. */
export interface TenantQueueIsolationAdapter {
  consumeCapture(message: unknown): Promise<void>;
  consumeJob(message: unknown): Promise<void>;
  effects(): Promise<unknown>;
}

/** Adapter coexistence tests provide once the tenant repository API is available. */
export interface TenantCoexistenceAdapter {
  createItem(input: { context: AuthContext; normalizedUrl: string }): Promise<void>;
  createCapture(input: { context: AuthContext; normalizedUrl: string }): Promise<void>;
  createDigest(input: { context: AuthContext; localDate: string }): Promise<void>;
  setPreference(input: { context: AuthContext; key: string }): Promise<void>;
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireInvariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** P3-ROUTE-001: guessed cross-tenant ids must be indistinguishable from absent ids. */
export async function assertCrossTenantNotFound(
  adapter: TenantRouteIsolationAdapter,
  fixture: TwoTenantFixture
): Promise<void> {
  const own = await adapter.getItem(fixture.alpha.auth.session, fixture.alpha.resources.itemId);
  const guessed = await adapter.getItem(fixture.beta.auth.session, fixture.alpha.resources.itemId);
  const absent = await adapter.getItem(fixture.beta.auth.session, adapter.unknownResourceId);

  requireInvariant(own.status >= 200 && own.status < 300, "Owner must be able to read its item");
  requireInvariant(guessed.status === 404, "Cross-tenant resource read must return 404");
  requireInvariant(absent.status === 404, "Unknown resource read must return 404");
  requireInvariant(
    equal(guessed.body, absent.body),
    "Cross-tenant and absent resource responses must have the same body"
  );
}

/** P3-REPO-001: repositories accept context and do not expose or mutate other tenants' ids. */
export async function assertRepositoryIsolation(
  adapter: TenantRepositoryIsolationAdapter,
  fixture: TwoTenantFixture
): Promise<void> {
  await adapter.seed(fixture);
  const alphaItemIds = await adapter.listItemIds(fixture.alpha.auth.session);
  const betaItemIds = await adapter.listItemIds(fixture.beta.auth.session);

  requireInvariant(
    alphaItemIds.includes(fixture.alpha.resources.itemId),
    "Alpha repository read omitted alpha's item"
  );
  requireInvariant(
    !alphaItemIds.includes(fixture.beta.resources.itemId),
    "Alpha repository read leaked beta's item"
  );
  requireInvariant(
    betaItemIds.includes(fixture.beta.resources.itemId),
    "Beta repository read omitted beta's item"
  );
  requireInvariant(
    (await adapter.findItem(fixture.beta.auth.session, fixture.alpha.resources.itemId)) === null,
    "Cross-tenant repository lookup must conceal the resource"
  );
  requireInvariant(
    (await adapter.updateItem(fixture.beta.auth.session, fixture.alpha.resources.itemId)) === false,
    "Cross-tenant repository update must not mutate the resource"
  );
  requireInvariant(
    (await adapter.deleteItem(fixture.beta.auth.session, fixture.alpha.resources.itemId)) === false,
    "Cross-tenant repository delete must not mutate the resource"
  );
}

/** P3-QUEUE-001/P3-QUEUE-002: validate every forged envelope before any side effect. */
export async function assertForgedQueueEnvelopesRejected(
  adapter: TenantQueueIsolationAdapter,
  fixture: TwoTenantFixture
): Promise<void> {
  for (const forged of forgedQueueEnvelopeFixtures(fixture)) {
    const before = await adapter.effects();
    const consume = forged.envelopeKind === "capture" ? adapter.consumeCapture : adapter.consumeJob;
    let rejected = false;
    try {
      await consume(forged.input);
    } catch {
      rejected = true;
    }
    requireInvariant(rejected, `${forged.id} was accepted by the queue consumer`);
    requireInvariant(
      equal(await adapter.effects(), before),
      `${forged.id} caused queue side effects before rejection`
    );
  }
}

/** Same public URL/date/key must coexist across unrelated users. */
export async function assertTenantScopedCoexistence(
  adapter: TenantCoexistenceAdapter,
  fixture: TwoTenantFixture
): Promise<void> {
  const normalizedUrl = "https://example.test/shared";
  const localDate = "2026-09-07";
  const key = "daily-brief";
  const createForBoth = async (
    operation: (tenant: TenantFixture) => Promise<void>,
    label: string
  ): Promise<void> => {
    try {
      await Promise.all([operation(fixture.alpha), operation(fixture.beta)]);
    } catch (error) {
      throw new Error(`${label} must coexist for alpha and beta`, { cause: error });
    }
  };

  await createForBoth(
    (tenant) => adapter.createItem({ context: tenant.auth.session, normalizedUrl }),
    "normalized URL item"
  );
  await createForBoth(
    (tenant) => adapter.createCapture({ context: tenant.auth.session, normalizedUrl }),
    "normalized URL capture"
  );
  await createForBoth(
    (tenant) => adapter.createDigest({ context: tenant.auth.session, localDate }),
    "digest date"
  );
  await createForBoth(
    (tenant) => adapter.setPreference({ context: tenant.auth.session, key }),
    "preference key"
  );
}

/** Compile-time compatibility anchors for eventual production adapters. */
export type TenantQueueEnvelope = CaptureQueueMessageV2 | TenantJobEnvelopeV1;
