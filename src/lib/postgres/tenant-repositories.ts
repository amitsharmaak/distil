import type { Sql, TransactionSql } from "postgres";

import {
  parseAuthContext,
  parseSystemContext,
  type AuthContext,
  type SystemContext,
  type UserId,
} from "@/lib/contracts/tenant-context";
import type {
  ControlPlaneAccountRepository,
  ControlPlaneRepositorySet,
  RepositorySet,
} from "@/lib/repositories/ports";

import { createPostgresRepositories } from "./repositories";

interface TenantSettingRow {
  user_id: string | null;
  actor_id: string | null;
  request_id: string | null;
}

type RepositoryMethod = (...args: unknown[]) => unknown;

function repositorySql(transaction: TransactionSql): Sql {
  return new Proxy(transaction, {
    get(target, property, receiver) {
      if (property === "begin") {
        return async (operation: (sql: Sql) => Promise<unknown>) =>
          target.savepoint((nested) => operation(repositorySql(nested)));
      }
      return Reflect.get(target, property, receiver);
    },
  }) as unknown as Sql;
}

/**
 * Establishes tenant and actor identity with transaction-local settings only.
 * A pool checkout never inherits the previous request's identity.
 */
export async function withTenantTransaction<T>(
  sql: Sql,
  context: AuthContext,
  operation: (transaction: Sql) => Promise<T>
): Promise<T> {
  const trusted = parseAuthContext(context);
  let result!: T;
  await sql.begin(async (transaction) => {
    await transaction`SELECT
      set_config('app.user_id', ${trusted.userId}, true),
      set_config('app.actor_id', ${trusted.actorId}, true),
      set_config('app.request_id', ${trusted.requestId}, true)`;
    const [setting] = await transaction<TenantSettingRow[]>`
      SELECT nullif(current_setting('app.user_id', true), '') AS user_id,
             nullif(current_setting('app.actor_id', true), '') AS actor_id,
             nullif(current_setting('app.request_id', true), '') AS request_id
    `;
    if (
      setting?.user_id !== trusted.userId ||
      setting.actor_id !== trusted.actorId ||
      setting.request_id !== trusted.requestId
    ) {
      throw new Error("Failed to establish transaction-local tenant context");
    }
    result = await operation(repositorySql(transaction));
  });
  return result;
}

async function withSystemTransaction<T>(
  sql: Sql,
  context: SystemContext,
  operation: (transaction: Sql) => Promise<T>
): Promise<T> {
  const trusted = parseSystemContext(context);
  let result!: T;
  await sql.begin(async (transaction) => {
    await transaction`SELECT
      set_config('app.actor_id', ${trusted.actorId}, true),
      set_config('app.request_id', ${trusted.requestId}, true)`;
    result = await operation(repositorySql(transaction));
  });
  return result;
}

function bindRepositorySet(sql: Sql, context: AuthContext): RepositorySet {
  const trusted = parseAuthContext(context);
  const unbound = createPostgresRepositories(sql);
  const bound: Partial<RepositorySet> = {};
  for (const key of Object.keys(unbound) as Array<keyof RepositorySet>) {
    const repository = unbound[key] as unknown as Record<string, RepositoryMethod>;
    const proxy = new Proxy(repository, {
      get(_target, property) {
        if (property === "then") return undefined;
        const method = repository[property as string];
        if (typeof method !== "function") return undefined;
        return (...args: unknown[]) =>
          withTenantTransaction(sql, trusted, async (transaction) => {
            const transactionRepositories = createPostgresRepositories(transaction);
            const transactionRepository = transactionRepositories[key] as unknown as Record<
              string,
              RepositoryMethod
            >;
            return transactionRepository[property as string].apply(transactionRepository, args);
          });
      },
    });
    (bound as Record<string, unknown>)[key] = proxy;
  }
  return bound as RepositorySet;
}

class PostgresControlPlaneAccounts implements ControlPlaneAccountRepository {
  constructor(
    private readonly sql: Sql,
    private readonly context: SystemContext
  ) {}

  async listActiveUserIds(input: { afterUserId?: UserId; limit: number }): Promise<UserId[]> {
    const limit = Math.max(1, Math.min(input.limit, 1_000));
    return withSystemTransaction(this.sql, this.context, async (transaction) => {
      const rows = await transaction<{ id: UserId }[]>`
        SELECT id
        FROM users
        WHERE status = 'active'
          AND (${input.afterUserId ?? null}::uuid IS NULL OR id > ${input.afterUserId ?? null}::uuid)
        ORDER BY id
        LIMIT ${limit}
      `;
      return rows.map(({ id }) => id);
    });
  }

  async listDeletionWork(input: {
    before: string;
    limit: number;
  }): Promise<Array<{ deletionId: string; userId: UserId }>> {
    const before = new Date(input.before);
    if (Number.isNaN(before.valueOf())) throw new Error("before must be an ISO timestamp");
    const limit = Math.max(1, Math.min(input.limit, 100));
    return withSystemTransaction(this.sql, this.context, async (transaction) => {
      const rows = await transaction<Array<{ deletion_id: string; user_id: UserId }>>`
        SELECT id::text AS deletion_id, user_id
        FROM account_deletions
        WHERE status IN ('requested','draining','purging')
          AND purge_after <= ${before.toISOString()}::timestamptz
        ORDER BY purge_after, id
        LIMIT ${limit}
      `;
      return rows.map((row) => ({ deletionId: row.deletion_id, userId: row.user_id }));
    });
  }
}

export interface PostgresRepositoryAccess {
  getTenantRepositories(context: AuthContext): RepositorySet;
  getControlPlaneRepositories(context: SystemContext): ControlPlaneRepositorySet;
}

/**
 * The optional control-plane client must authenticate as the separately
 * provisioned migration/control role; the runtime role is intentionally unable
 * to enumerate users or invitation state.
 */
export function createPostgresRepositoryAccess(
  runtimeSql: Sql,
  controlPlaneSql?: Sql
): PostgresRepositoryAccess {
  return {
    getTenantRepositories(context) {
      return bindRepositorySet(runtimeSql, context);
    },
    getControlPlaneRepositories(context) {
      const trusted = parseSystemContext(context);
      if (!controlPlaneSql) {
        throw new Error("A distinct control-plane PostgreSQL client is required");
      }
      return { accounts: new PostgresControlPlaneAccounts(controlPlaneSql, trusted) };
    },
  };
}
