import postgres, { type Options, type Sql } from "postgres";

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
  };
  return postgres(url, clientOptions);
}

export async function closePostgresClient(sql: Sql): Promise<void> {
  await sql.end({ timeout: 5 });
}
