import type { Sql, TransactionSql } from "postgres";

import { measurePhase } from "@/lib/observability/request-metrics";

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
import { PostgresAuthRepository } from "./auth-repository";
import { PostgresControlPlaneLifecycleRepository } from "./lifecycle-repositories";

interface TenantSettingRow {
  user_id: string | null;
  actor_id: string | null;
  actor_kind: string | null;
  request_id: string | null;
  environment: string | null;
  search_path: string | null;
}

const RUNTIME_ENVIRONMENT = "runtime";
/** Server-Timing phase that accumulates every tenant or system transaction. */
const DATABASE_PHASE = "db";
const TENANT_SEARCH_PATH = "tenant_api, pg_catalog";

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
  return withTenantTransactionOptions(sql, context, operation);
}

async function withTenantTransactionOptions<T>(
  sql: Sql,
  context: AuthContext,
  operation: (transaction: Sql) => Promise<T>,
  options?: string
): Promise<T> {
  const trusted = parseAuthContext(context);
  let result!: T;
  const run = async (transaction: TransactionSql) => {
    // One round trip: the CTE applies the transaction-local settings (set_config
    // is volatile, so it is materialised before the outer SELECT runs) and the
    // outer SELECT reads them back through current_setting. Reading the session
    // state, never the echoed parameters, is what proves the context is bound.
    const [setting] = await transaction<TenantSettingRow[]>`
      WITH applied AS (
        SELECT set_config('app.user_id', ${trusted.userId}, true) AS user_id,
               set_config('app.actor_id', ${trusted.actorId}, true) AS actor_id,
               set_config('app.actor_kind', ${trusted.actorKind}, true) AS actor_kind,
               set_config('app.request_id', ${trusted.requestId}, true) AS request_id,
               set_config('app.environment', ${RUNTIME_ENVIRONMENT}, true) AS environment,
               set_config('search_path', ${TENANT_SEARCH_PATH}, true) AS search_path
      )
      SELECT nullif(current_setting('app.user_id', true), '') AS user_id,
             nullif(current_setting('app.actor_id', true), '') AS actor_id,
             nullif(current_setting('app.actor_kind', true), '') AS actor_kind,
             nullif(current_setting('app.request_id', true), '') AS request_id,
             nullif(current_setting('app.environment', true), '') AS environment,
             current_setting('search_path', true) AS search_path
      FROM applied
    `;
    if (
      setting?.user_id !== trusted.userId ||
      setting.actor_id !== trusted.actorId ||
      setting.actor_kind !== trusted.actorKind ||
      setting.request_id !== trusted.requestId ||
      setting.environment !== RUNTIME_ENVIRONMENT ||
      setting.search_path !== TENANT_SEARCH_PATH
    ) {
      throw new Error("Failed to establish transaction-local tenant context");
    }
    result = await operation(repositorySql(transaction));
  };
  await measurePhase(DATABASE_PHASE, async () => {
    if (options) await sql.begin(options, run);
    else await sql.begin(run);
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
  await measurePhase(DATABASE_PHASE, () =>
    sql.begin(async (transaction) => {
      await transaction`SELECT
      set_config('app.actor_id', ${trusted.actorId}, true),
      set_config('app.request_id', ${trusted.requestId}, true)`;
      result = await operation(repositorySql(transaction));
    })
  );
  return result;
}

/**
 * Binds a repository set to one already-open tenant transaction, so every
 * repository call inside `operation` shares that transaction and nested
 * `begin` calls (tenant locks, upserts) become savepoints of it.
 */
export async function withTenantRepositories<T>(
  sql: Sql,
  context: AuthContext,
  operation: (repositories: RepositorySet) => Promise<T>
): Promise<T> {
  const trusted = parseAuthContext(context);
  return withTenantTransactionOptions(sql, trusted, (transaction) =>
    operation(createPostgresRepositories(transaction, trusted))
  );
}

const unboundRepositorySets = new WeakMap<Sql, RepositorySet>();

/**
 * The unbound set is only consulted for its shape (keys and method names);
 * every real call runs on a per-transaction set. Build it once per client.
 */
function unboundRepositorySet(sql: Sql): RepositorySet {
  let unbound = unboundRepositorySets.get(sql);
  if (!unbound) {
    unbound = createPostgresRepositories(sql);
    unboundRepositorySets.set(sql, unbound);
  }
  return unbound;
}

function bindRepositorySet(sql: Sql, context: AuthContext): RepositorySet {
  const trusted = parseAuthContext(context);
  const unbound = unboundRepositorySet(sql);
  const bound: Partial<RepositorySet> = {};
  for (const key of Object.keys(unbound) as Array<keyof RepositorySet>) {
    const repository = unbound[key] as unknown as Record<string, RepositoryMethod>;
    const proxy = new Proxy(repository, {
      get(_target, property) {
        if (property === "then") return undefined;
        const method = repository[property as string];
        if (typeof method !== "function") return undefined;
        return (...args: unknown[]) =>
          withTenantTransactionOptions(
            sql,
            trusted,
            async (transaction) => {
              const transactionRepositories = createPostgresRepositories(transaction, trusted);
              const transactionRepository = transactionRepositories[key] as unknown as Record<
                string,
                RepositoryMethod
              >;
              return Reflect.apply(
                transactionRepository[property as string],
                transactionRepository,
                args
              );
            },
            key === "lifecycle" && property === "readExportDatasets"
              ? "isolation level repeatable read read only"
              : undefined
          );
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
  withTenantRepositories<T>(
    context: AuthContext,
    operation: (repositories: RepositorySet) => Promise<T>
  ): Promise<T>;
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
    withTenantRepositories(context, operation) {
      return withTenantRepositories(runtimeSql, context, operation);
    },
    getControlPlaneRepositories(context) {
      const trusted = parseSystemContext(context);
      if (!controlPlaneSql) {
        throw new Error("A distinct control-plane PostgreSQL client is required");
      }
      return {
        auth: new PostgresAuthRepository(controlPlaneSql),
        accounts: new PostgresControlPlaneAccounts(controlPlaneSql, trusted),
        lifecycle: new PostgresControlPlaneLifecycleRepository(controlPlaneSql),
      };
    },
  };
}
