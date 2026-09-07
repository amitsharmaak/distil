import type { Sql } from "postgres";

import { createAuthContext, createSystemContext } from "@/lib/contracts/tenant-context";

import { createPostgresRepositoryAccess, withTenantTransaction } from "../tenant-repositories";

const context = createAuthContext({
  userId: "11111111-1111-4111-8111-111111111111",
  actorKind: "user",
  actorId: "11111111-1111-4111-8111-111111111111",
  sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
});

function sqlDouble() {
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
        },
      ];
    }
    return [];
  }) as unknown as Sql;
  Object.assign(sql, {
    begin: jest.fn(async (operation: (transaction: Sql) => Promise<unknown>) => operation(sql)),
    savepoint: jest.fn(async (operation: (transaction: Sql) => Promise<unknown>) => operation(sql)),
    json: jest.fn((value: unknown) => value),
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
    expect(fake.queries[1]).toContain("current_setting('app.user_id'");
  });

  it("returns repository methods with no caller-selected user argument", async () => {
    const fake = sqlDouble();
    const repositories = createPostgresRepositoryAccess(fake.sql).getTenantRepositories(context);
    await expect(repositories.items.findById("item-1")).resolves.toBeUndefined();
    expect(fake.queries.some((query) => query.includes("FROM items i"))).toBe(true);
    expect((fake.sql.begin as jest.Mock).mock.calls).toHaveLength(1);
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
