import postgres, { type Options, type Sql } from "postgres";

import { recordDatabaseStatement } from "@/lib/observability/request-metrics";

export interface PostgresClientOptions {
  url?: string;
  max?: number;
  idleTimeoutSeconds?: number;
}

/** Create the small, transaction-pooler-safe client used by repository adapters. */
export function createPostgresClient(options: PostgresClientOptions = {}): Sql {
  const url = options.url ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for PostgreSQL storage");

  const clientOptions: Options<Record<string, postgres.PostgresType>> = {
    max: options.max ?? 4,
    idle_timeout: options.idleTimeoutSeconds ?? 20,
    connect_timeout: 10,
    prepare: false,
    // Counts statements and transactions for the active request's metrics
    // store; a no-op outside one. Receives the SQL text only, never parameters.
    debug: (_connection, query) => recordDatabaseStatement(query),
  };
  return postgres(url, clientOptions);
}

/**
 * Registry key for the process-wide client memo. It lives on `globalThis`
 * rather than in module scope so the pool survives Next.js dev-server module
 * reloads instead of leaking one pool per recompilation.
 */
const SHARED_CLIENTS = Symbol.for("distil.postgres.clients");

type SharedClientRegistry = Map<string, Sql>;

function sharedClientRegistry(): SharedClientRegistry {
  const host = globalThis as typeof globalThis & { [SHARED_CLIENTS]?: SharedClientRegistry };
  host[SHARED_CLIENTS] ??= new Map();
  return host[SHARED_CLIENTS];
}

/**
 * One memoised client per connection URL. The URL is only ever used as the
 * registry key; it is never logged or included in an error.
 */
export function getSharedPostgresClient(
  url: string,
  options: Omit<PostgresClientOptions, "url"> = {}
): Sql {
  if (!url) throw new Error("DATABASE_URL is required for PostgreSQL storage");
  const registry = sharedClientRegistry();
  let client = registry.get(url);
  if (!client) {
    client = createPostgresClient({ ...options, url });
    registry.set(url, client);
  }
  return client;
}

export async function closePostgresClient(sql: Sql): Promise<void> {
  await sql.end({ timeout: 5 });
}
