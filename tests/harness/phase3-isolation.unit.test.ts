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

describe("Phase 3 reusable isolation assertions", () => {
  const fixture = createTwoTenantFixture();

  it("requires a byte-equivalent 404 for a guessed cross-tenant route id", async () => {
    const adapter: TenantRouteIsolationAdapter = {
      unknownResourceId: "unknown-item",
      async getItem(context, itemId) {
        if (context.userId === fixture.alpha.user.id && itemId === fixture.alpha.resources.itemId) {
          return { status: 200, body: { id: itemId } };
        }
        return { status: 404, body: { error: { code: "NOT_FOUND" } } };
      },
    };

    await expect(assertCrossTenantNotFound(adapter, fixture)).resolves.toBeUndefined();
  });

  it("rejects a distinguishable cross-tenant route response", async () => {
    const adapter: TenantRouteIsolationAdapter = {
      unknownResourceId: "unknown-item",
      async getItem(context, itemId) {
        if (context.userId === fixture.alpha.user.id && itemId === fixture.alpha.resources.itemId) {
          return { status: 200, body: { id: itemId } };
        }
        return {
          status: 404,
          body: itemId === fixture.alpha.resources.itemId ? { error: "other user" } : { error: "none" },
        };
      },
    };

    await expect(assertCrossTenantNotFound(adapter, fixture)).rejects.toThrow("same body");
  });

  it("checks list, lookup, update, and delete isolation through a repository adapter", async () => {
    const adapter: TenantRepositoryIsolationAdapter = {
      async seed() {},
      async listItemIds(context) {
        return context.userId === fixture.alpha.user.id
          ? [fixture.alpha.resources.itemId]
          : [fixture.beta.resources.itemId];
      },
      async findItem(context, itemId) {
        return context.userId === fixture.alpha.user.id && itemId === fixture.alpha.resources.itemId
          ? { id: itemId }
          : null;
      },
      async updateItem(context, itemId) {
        return context.userId === fixture.alpha.user.id && itemId === fixture.alpha.resources.itemId;
      },
      async deleteItem(context, itemId) {
        return context.userId === fixture.alpha.user.id && itemId === fixture.alpha.resources.itemId;
      },
    };

    await expect(assertRepositoryIsolation(adapter, fixture)).resolves.toBeUndefined();
  });

  it("requires every forged queue envelope to fail before effects", async () => {
    const effects: unknown[] = [];
    const adapter: TenantQueueIsolationAdapter = {
      async consumeCapture() {
        throw new Error("rejected");
      },
      async consumeJob() {
        throw new Error("rejected");
      },
      async effects() {
        return effects;
      },
    };

    await expect(assertForgedQueueEnvelopesRejected(adapter, fixture)).resolves.toBeUndefined();
  });

  it("requires same URL, date, and preference key to coexist across users", async () => {
    const stored = new Set<string>();
    const adapter: TenantCoexistenceAdapter = {
      async createItem({ context, normalizedUrl }) {
        stored.add(`item:${context.userId}:${normalizedUrl}`);
      },
      async createCapture({ context, normalizedUrl }) {
        stored.add(`capture:${context.userId}:${normalizedUrl}`);
      },
      async createDigest({ context, localDate }) {
        stored.add(`digest:${context.userId}:${localDate}`);
      },
      async setPreference({ context, key }) {
        stored.add(`preference:${context.userId}:${key}`);
      },
    };

    await assertTenantScopedCoexistence(adapter, fixture);
    expect(stored.size).toBe(8);
  });
});
