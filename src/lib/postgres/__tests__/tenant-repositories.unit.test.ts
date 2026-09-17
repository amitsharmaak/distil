import type { Sql } from "postgres";

import { createAuthContext, createSystemContext } from "@/lib/contracts/tenant-context";

import {
  createPostgresRepositoryAccess,
  withTenantRepositories,
  withTenantTransaction,
} from "../tenant-repositories";

const context = createAuthContext({
  userId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  actorId: "11111111-1111-4111-8111-111111111111",
  sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
});

function sqlDouble(settingOverrides: Partial<Record<string, string>> = {}) {
  const queries: string[] = [];
  const sql = jest.fn(async (strings: TemplateStringsArray): Promise<unknown[]> => {
    const query = strings.join("?");
    queries.push(query);
    if (query.includes("current_setting('app.user_id'")) {
      return [
        {
          user_id: context.userId,
          actor_id: context.actorId,
          actor_kind: context.actorKind,
          request_id: context.requestId,
          environment: "runtime",
          search_path: "tenant_api, pg_catalog",
          ...settingOverrides,
        },
      ];
    }
    if (query.includes("INSERT INTO item_notes")) {
      return [
        {
          item_id: "item-1",
          body: "note",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ];
    }
    return [];
  }) as unknown as Sql;
  Object.assign(sql, {
    begin: jest.fn(async (operation: (transaction: Sql) => Promise<unknown>) => operation(sql)),
    savepoint: jest.fn(async (operation: (transaction: Sql) => Promise<unknown>) => operation(sql)),
    json: jest.fn((value: unknown) => value),
    unsafe: jest.fn((text: string) => text),
  });
  return { sql, queries };
}

describe("tenant-bound PostgreSQL repository access", () => {
  it("sets and verifies tenant identity transaction-locally", async () => {
    const fake = sqlDouble();
    await expect(withTenantTransaction(fake.sql, context, async () => "ok")).resolves.toBe("ok");
    expect(fake.queries[0]).toContain("set_config('app.user_id'");
    expect(fake.queries[0]).toContain("set_config('app.actor_id'");
    expect(fake.queries[0]).toContain("set_config('app.actor_kind'");
    expect(fake.queries[0]).toContain("set_config('app.request_id'");
    expect(fake.queries[0]).toContain("set_config('app.environment'");
    expect(fake.queries[0]).toContain("set_config('search_path'");
    // Applying and proving the settings is one round trip: the same statement
    // reads them back through current_setting rather than echoing parameters.
    expect(fake.queries[0]).toContain("current_setting('app.user_id'");
    expect(fake.queries[0]).toContain("current_setting('search_path'");
    expect(fake.queries[0]).toContain("AS search_path");
    expect(fake.queries.filter((query) => query.includes("AS search_path"))).toHaveLength(1);
    expect((fake.sql.begin as jest.Mock).mock.calls).toHaveLength(1);
  });

  it("fails closed when the proven session state does not match the caller", async () => {
    const fake = sqlDouble({ user_id: "22222222-2222-4222-8222-222222222222" });
    const operation = jest.fn(async () => "never");
    await expect(withTenantTransaction(fake.sql, context, operation)).rejects.toThrow(
      "Failed to establish transaction-local tenant context"
    );
    expect(operation).not.toHaveBeenCalled();
  });

  it("returns repository methods with no caller-selected user argument", async () => {
    const fake = sqlDouble();
    const repositories = createPostgresRepositoryAccess(fake.sql).getTenantRepositories(context);
    await expect(repositories.items.findById("item-1")).resolves.toBeUndefined();
    expect(fake.queries.some((query) => query.includes("FROM items i"))).toBe(true);
    expect((fake.sql.begin as jest.Mock).mock.calls).toHaveLength(1);
  });

  it("shares one tenant transaction across repositories in withTenantRepositories", async () => {
    const fake = sqlDouble();
    const result = await withTenantRepositories(fake.sql, context, async (repositories) => {
      await repositories.items.findById("item-1");
      await repositories.summaries.findAll("item-1");
      await repositories.feedback.findForItem("item-1");
      return "done";
    });
    expect(result).toBe("done");
    expect((fake.sql.begin as jest.Mock).mock.calls).toHaveLength(1);
    expect(fake.queries.filter((query) => query.includes("AS search_path"))).toHaveLength(1);
    expect(fake.queries.some((query) => query.includes("FROM items i"))).toBe(true);
    expect(fake.queries.some((query) => query.includes("FROM ai_summaries"))).toBe(true);
    expect(fake.queries.some((query) => query.includes("FROM feedback"))).toBe(true);
  });

  it("turns nested transactions inside withTenantRepositories into savepoints", async () => {
    const fake = sqlDouble();
    const access = createPostgresRepositoryAccess(fake.sql);
    await access.withTenantRepositories(context, async (repositories) => {
      await repositories.itemNotes.upsert({
        itemId: "item-1",
        body: "note",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    });
    expect((fake.sql.begin as jest.Mock).mock.calls).toHaveLength(1);
    expect((fake.sql as unknown as { savepoint: jest.Mock }).savepoint.mock.calls).toHaveLength(1);
    expect(fake.queries.some((query) => query.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(fake.queries.filter((query) => query.includes("AS search_path"))).toHaveLength(1);
  });

  it("keeps withTenantRepositories failing closed on a tenant mismatch", async () => {
    const fake = sqlDouble({ user_id: "22222222-2222-4222-8222-222222222222" });
    const operation = jest.fn(async () => "never");
    await expect(
      createPostgresRepositoryAccess(fake.sql).withTenantRepositories(context, operation)
    ).rejects.toThrow("Failed to establish transaction-local tenant context");
    expect(operation).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(1);
  });

  it("requires a distinct client before exposing the narrow control plane", () => {
    const fake = sqlDouble();
    const system = createSystemContext({
      actorKind: "system",
      actorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      requestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    });
    expect(() =>
      createPostgresRepositoryAccess(fake.sql).getControlPlaneRepositories(system)
    ).toThrow("distinct control-plane");
  });
});
