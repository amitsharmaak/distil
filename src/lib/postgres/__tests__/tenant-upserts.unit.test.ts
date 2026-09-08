import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Sql } from "postgres";

import { tenantLockKey, withTenantLocks } from "../tenant-lock";

describe("tenant-view-safe PostgreSQL upserts", () => {
  it("keeps every production repository conflict clause off tenant security-barrier views", async () => {
    const [repositories, digestStore, contract] = await Promise.all([
      readFile(resolve(process.cwd(), "src/lib/postgres/repositories.ts"), "utf8"),
      readFile(resolve(process.cwd(), "src/lib/digests/postgres-store.ts"), "utf8"),
      readFile(
        resolve(
          process.cwd(),
          "src/lib/postgres/tenant-migrations/0007_phase3_tenant_contract.sql"
        ),
        "utf8"
      ),
    ]);

    expect(`${repositories}\n${digestStore}`).not.toMatch(/\bON\s+CONFLICT\b/i);
    for (const table of [
      "item_notes",
      "collection_items",
      "item_events",
      "digest_runs",
      "personal_preferences",
      "digest_jobs",
      "content_chunks",
      "intelligence_claims",
      "claim_evidence",
      "knowledge_backfill_checkpoints",
      "oauth_tokens",
      "ai_summaries",
      "user_settings",
      "item_embeddings",
    ]) {
      expect(contract).toContain(`'${table}'`);
    }
  });

  it("sorts and deduplicates tenant-relative advisory locks before the write sequence", async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const transaction = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join("?"), values });
      return Promise.resolve([]);
    }) as unknown as Sql;
    const sql = Object.assign(jest.fn(), {
      begin: jest.fn(async (operation: (tx: Sql) => Promise<void>) => operation(transaction)),
    }) as unknown as Sql;
    const beta = tenantLockKey("settings", "beta");
    const alpha = tenantLockKey("settings", "alpha");

    await withTenantLocks(sql, [beta, alpha, beta], async (tx) => {
      await tx`SELECT 1`;
    });

    expect(calls).toHaveLength(3);
    expect(calls[0].text).toContain("current_setting('app.user_id', true)");
    expect(calls.slice(0, 2).map(({ values }) => values[0])).toEqual([alpha, beta]);
    expect(calls[2].text).toContain("SELECT 1");
  });
});
