import type { Sql } from "postgres";

type LockPart = string | number;

/**
 * Builds a stable, unambiguous advisory-lock identity for one repository key.
 * The database-side lock also includes app.user_id, so identical personal keys
 * in different tenants never serialize each other.
 */
export function tenantLockKey(scope: string, ...parts: LockPart[]): string {
  return JSON.stringify([scope, ...parts]);
}

/**
 * Serializes a tenant-relative select/update/insert sequence without requiring
 * constraint inference on tenant_api security-barrier views. Sorting prevents
 * deadlocks when one operation protects more than one unique identity.
 */
export async function withTenantLocks<T>(
  sql: Sql,
  keys: readonly string[],
  operation: (transaction: Sql) => Promise<T>
): Promise<T> {
  const orderedKeys = [...new Set(keys)].sort();
  let result!: T;
  await sql.begin(async (transaction) => {
    const transactionalSql = transaction as unknown as Sql;
    for (const key of orderedKeys) {
      await transactionalSql`
        SELECT pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(
            COALESCE(
              NULLIF(pg_catalog.current_setting('app.user_id', true), ''),
              'unscoped'
            ) || ':' || ${key},
            0
          )
        )
      `;
    }
    result = await operation(transactionalSql);
  });
  return result;
}
