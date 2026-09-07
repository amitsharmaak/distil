import type { Sql, TransactionSql } from "postgres";
import type { AuthContext } from "./phase3-tenancy";

export interface TenantRlsPoolHarnessOptions {
  settingName?: string;
}

interface TenantSettingRow {
  user_id: string | null;
}

/**
 * Applies tenant identity transaction-locally. `set_config(..., true)` is the
 * parameterized equivalent of SET LOCAL and cannot survive commit or rollback.
 */
export class TenantRlsPoolHarness {
  readonly settingName: string;

  constructor(
    private readonly sql: Sql,
    options: TenantRlsPoolHarnessOptions = {}
  ) {
    this.settingName = options.settingName ?? "app.user_id";
  }

  async asTenant<T>(
    context: AuthContext,
    operation: (transaction: TransactionSql) => Promise<T>
  ): Promise<T> {
    if (!context.userId || !context.actorId || !context.requestId) {
      throw new Error("Tenant RLS context requires userId, actorId, and requestId");
    }
    let result!: T;
    await this.sql.begin(async (transaction) => {
      await transaction`SELECT set_config(${this.settingName}, ${context.userId}, true)`;
      const [setting] = await transaction<TenantSettingRow[]>`
        SELECT nullif(current_setting(${this.settingName}, true), '') AS user_id
      `;
      if (setting?.user_id !== context.userId) {
        throw new Error(`Failed to establish transaction-local ${this.settingName}`);
      }
      result = await operation(transaction);
    });
    return result;
  }

  /** Observe the checked-out connection outside a tenant transaction. */
  async currentTenant(): Promise<string | null> {
    const [setting] = await this.sql<TenantSettingRow[]>`
      SELECT nullif(current_setting(${this.settingName}, true), '') AS user_id
    `;
    return setting?.user_id ?? null;
  }

  async assertTenantCleared(): Promise<void> {
    const tenant = await this.currentTenant();
    if (tenant !== null) {
      throw new Error(`Pooled connection leaked ${this.settingName}=${tenant}`);
    }
  }
}

export interface TenantPoolObservation<T> {
  userId: string;
  result: T;
  tenantAfterCheckout: string | null;
}

/** Alternate tenants through the same pool and record post-checkout state. */
export async function observePooledTenantIsolation<T>(
  harness: TenantRlsPoolHarness,
  contexts: readonly AuthContext[],
  operation: (transaction: TransactionSql, context: AuthContext) => Promise<T>
): Promise<TenantPoolObservation<T>[]> {
  const observations: TenantPoolObservation<T>[] = [];
  for (const context of contexts) {
    const result = await harness.asTenant(context, (transaction) =>
      operation(transaction, context)
    );
    observations.push({
      userId: context.userId,
      result,
      tenantAfterCheckout: await harness.currentTenant(),
    });
  }
  return observations;
}
