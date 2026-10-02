import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tenantMigrationManifest } from "@/lib/postgres/tenant-migration/manifest";
import {
  findTenantIsolationActivation,
  findTenantMigrationEvidence,
  tenantManifestInvariantSpecs,
} from "../support/migration-invariants";

describe("tenant migration evidence", () => {
  it("requires user_id, RLS enablement, and a policy", () => {
    expect(
      findTenantMigrationEvidence(resolve(__dirname, "../fixtures/phase3/migrations"))
    ).toMatchObject({
      present: true,
      files: ["0001_tenant_probe.sql"],
      signals: {
        userColumn: true,
        rlsEnabled: true,
        policyCreated: true,
      },
    });
    expect(findTenantMigrationEvidence(resolve(__dirname, "../fixtures/migrations"))).toMatchObject(
      {
        present: false,
      }
    );
  });

  it("does not allow a workspace-only migration to activate the Phase 3 gate", () => {
    expect(
      findTenantMigrationEvidence(
        resolve(__dirname, "../fixtures/phase3/workspace-only-migrations")
      )
    ).toMatchObject({
      present: false,
      signals: {
        userColumn: false,
        rlsEnabled: true,
        policyCreated: true,
      },
    });
  });

  it("waits for every frozen Phase 2 and Wave 0 table, not one incidental tenant marker", () => {
    const fixtureMigrations = resolve(__dirname, "../fixtures/phase3/migrations");
    const activation = findTenantIsolationActivation(fixtureMigrations, tenantMigrationManifest);

    expect(activation.ready).toBe(false);
    expect(activation.missing).toEqual(expect.arrayContaining(["table marker: items"]));
  });

  it("generates one strict invariant specification for every manifest table", () => {
    const specs = tenantManifestInvariantSpecs(tenantMigrationManifest);
    const chunks = specs.find(({ tableName }) => tableName === "content_chunks")!;

    expect(specs).toHaveLength(tenantMigrationManifest.tables.length + 1);
    expect(
      specs.find(({ tableName }) => tableName === "shortcut_pairings")?.ownershipReferences
    ).toEqual([
      expect.objectContaining({
        sourceColumns: ["token_id"],
        targetTable: "capture_tokens",
        targetColumns: ["id"],
      }),
    ]);
    expect(specs.every((spec) => spec.tenantReferences?.tableName === "users")).toBe(true);
    expect(chunks.ownershipReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "content_version_item",
          sourceColumns: ["content_version_id", "item_id"],
          targetTable: "item_content_versions",
          targetColumns: ["id", "item_id"],
        }),
      ])
    );
  });
});

describe("P7 performance index migration", () => {
  // Statements only: the header comments explain the CONCURRENTLY and jsonb_path_ops choices.
  const migration = readFileSync(
    resolve(process.cwd(), "src/lib/postgres/tenant-migrations/0010_perf_indexes.sql"),
    "utf8"
  )
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("adds only the additive, idempotent, tenant-leading signal index and the summary hash column", () => {
    expect(migration).toContain(
      "CHECK (stage IN ('expand','backfill','contract','lifecycle','returning-auth','perf-indexes'))"
    );
    expect(migration).toMatch(
      /CREATE INDEX IF NOT EXISTS item_events_user_type_occurred_idx\s+ON item_events\(user_id, event_type, occurred_at DESC\)/
    );
    // Unreachable under forced RLS for the runtime role (see the migration header); an index
    // the planner cannot use is write cost only.
    expect(migration).not.toContain("ON items");
    expect(migration).not.toContain("gin(");
    expect(migration).toContain(
      "ALTER TABLE ai_summaries\n  ADD COLUMN IF NOT EXISTS content_hash text"
    );
    for (const forbidden of [
      "CONCURRENTLY",
      "DROP TABLE",
      "DROP COLUMN",
      "DISABLE ROW LEVEL",
      "GRANT ",
    ]) {
      expect(migration).not.toContain(forbidden);
    }
  });
});

describe("Adaptive summaries S1 migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "src/lib/postgres/tenant-migrations/0011_summary_structure.sql"),
    "utf8"
  )
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("adds two nullable ai_summaries columns and rebuilds only that tenant view", () => {
    expect(migration).toContain(
      "CHECK (stage IN ('expand','backfill','contract','lifecycle','returning-auth','perf-indexes','summary-structure'))"
    );
    expect(migration).toMatch(
      /ALTER TABLE ai_summaries\s+ADD COLUMN IF NOT EXISTS structured jsonb,\s+ADD COLUMN IF NOT EXISTS prompt_version text;/
    );
    expect(migration).not.toContain("NOT NULL");
    // PostgreSQL froze the view's column list at creation; without the rebuild the runtime role
    // cannot see the new columns.
    expect(migration).toMatch(
      /CREATE OR REPLACE VIEW tenant_api\.ai_summaries WITH \(security_barrier=true\) AS\s+SELECT \* FROM public\.ai_summaries\s+WHERE user_id = nullif\(current_setting\('app\.user_id', true\), ''\)::uuid\s+WITH CASCADED CHECK OPTION;/
    );
    expect(migration.match(/CREATE OR REPLACE VIEW/g)).toHaveLength(1);
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_api.ai_summaries TO distil_runtime;"
    );
    expect(migration.match(/GRANT /g)).toHaveLength(1);
    for (const forbidden of [
      "CONCURRENTLY",
      "DROP TABLE",
      "DROP COLUMN",
      "DROP VIEW",
      "DISABLE ROW LEVEL",
      "UPDATE ai_summaries",
      "DELETE FROM",
    ]) {
      expect(migration).not.toContain(forbidden);
    }
  });
});

describe("Inline search F1 migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "src/lib/postgres/tenant-migrations/0012_feed_search.sql"),
    "utf8"
  )
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("adds two generated items columns, one tenant-scoped index, and rebuilds only the items view", () => {
    expect(migration).toContain(
      "CHECK (stage IN ('expand','backfill','contract','lifecycle','returning-auth','perf-indexes','summary-structure','feed-search'))"
    );
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS feed_search_vector tsvector GENERATED ALWAYS AS ("
    );
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS site text GENERATED ALWAYS AS (");
    expect(migration.match(/STORED/g)).toHaveLength(2);
    expect(migration).not.toContain("NOT NULL");
    expect(migration).toContain(
      "CREATE INDEX IF NOT EXISTS items_user_site_idx ON items(user_id, site);"
    );
    expect(migration.match(/CREATE INDEX/g)).toHaveLength(1);
    // PostgreSQL froze the view's column list at creation; without the rebuild the runtime role
    // cannot see the new columns.
    expect(migration).toMatch(
      /CREATE OR REPLACE VIEW tenant_api\.items WITH \(security_barrier=true\) AS\s+SELECT \* FROM public\.items\s+WHERE user_id = nullif\(current_setting\('app\.user_id', true\), ''\)::uuid\s+WITH CASCADED CHECK OPTION;/
    );
    expect(migration.match(/CREATE OR REPLACE VIEW/g)).toHaveLength(1);
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_api.items TO distil_runtime;"
    );
    expect(migration.match(/GRANT /g)).toHaveLength(1);
    for (const forbidden of [
      "CONCURRENTLY",
      "DROP TABLE",
      "DROP COLUMN",
      "DROP VIEW",
      "DISABLE ROW LEVEL",
      "UPDATE items",
      "DELETE FROM",
      "USING gin",
    ]) {
      expect(migration).not.toContain(forbidden);
    }
  });
});

describe("Life areas F2 migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "src/lib/postgres/tenant-migrations/0013_life_areas.sql"),
    "utf8"
  )
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("adds nullable, checked area columns, one tenant-scoped index, and rebuilds only the items view", () => {
    expect(migration).toContain(
      "CHECK (stage IN ('expand','backfill','contract','lifecycle','returning-auth','perf-indexes','summary-structure','feed-search','life-areas'))"
    );
    for (const column of [
      "area text",
      "area_confidence double precision",
      "area_reason text",
      "area_model text",
      "area_classified_at timestamptz",
      "manual_area text",
      "manual_area_at timestamptz",
    ]) {
      expect(migration).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
    expect(migration).not.toContain("NOT NULL");
    expect(migration).not.toContain("DEFAULT");
    expect(migration).toContain(
      "CHECK (area IS NULL OR area IN ('personal','work','learning','updates'))"
    );
    expect(migration).toContain(
      "CHECK (manual_area IS NULL OR manual_area IN ('personal','work','learning','updates'))"
    );
    expect(migration).toContain("ON items(user_id, (COALESCE(manual_area, area)));");
    expect(migration.match(/CREATE INDEX/g)).toHaveLength(1);
    expect(migration).toMatch(
      /CREATE OR REPLACE VIEW tenant_api\.items WITH \(security_barrier=true\) AS\s+SELECT \* FROM public\.items\s+WHERE user_id = nullif\(current_setting\('app\.user_id', true\), ''\)::uuid\s+WITH CASCADED CHECK OPTION;/
    );
    expect(migration.match(/CREATE OR REPLACE VIEW/g)).toHaveLength(1);
    expect(migration.match(/GRANT /g)).toHaveLength(1);
    for (const forbidden of [
      "CONCURRENTLY",
      "DROP TABLE",
      "DROP COLUMN",
      "DROP VIEW",
      "DISABLE ROW LEVEL",
      "UPDATE items",
      "DELETE FROM",
    ]) {
      expect(migration).not.toContain(forbidden);
    }
  });
});

describe("Collections removal migration", () => {
  const raw = readFileSync(
    resolve(process.cwd(), "src/lib/postgres/tenant-migrations/0014_drop_collections.sql"),
    "utf8"
  );
  const migration = raw
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("extends the stage check, records row counts, and drops only the two collections tables and their views", () => {
    expect(migration).toContain(
      "CHECK (stage IN ('expand','backfill','contract','lifecycle','returning-auth','perf-indexes','summary-structure','feed-search','life-areas','drop-collections'))"
    );
    expect(migration.match(/RAISE NOTICE/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration.match(/^DROP TABLE /gm)).toEqual(["DROP TABLE ", "DROP TABLE "]);
    const dropItems = migration.indexOf("DROP TABLE IF EXISTS public.collection_items;");
    const dropCollections = migration.indexOf("DROP TABLE IF EXISTS public.collections;");
    expect(dropItems).toBeGreaterThan(-1);
    expect(dropCollections).toBeGreaterThan(dropItems);
    expect(migration).toContain("DROP VIEW IF EXISTS tenant_api.collection_items;");
    expect(migration).toContain("DROP VIEW IF EXISTS tenant_api.collections;");
    expect(migration).not.toMatch(/CASCADE|TRUNCATE|DELETE FROM|DROP COLUMN|DISABLE ROW LEVEL/);
    expect(migration.indexOf("RAISE NOTICE")).toBeLessThan(dropItems);
  });

  it("documents ordering, idempotency, rollback and the data loss", () => {
    expect(raw).toContain("Deploy order");
    expect(raw).toContain("DELETES DATA");
    expect(raw).toContain("Idempotent");
    expect(raw).toContain("Rollback");
  });
});

describe("Browser connections X1 migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "src/lib/postgres/tenant-migrations/0015_browser_connections.sql"),
    "utf8"
  )
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("extends the ledger stage list by exactly one stage", () => {
    expect(migration).toContain(
      "CHECK (stage IN ('expand','backfill','contract','lifecycle','returning-auth','perf-indexes','summary-structure','feed-search','life-areas','drop-collections','browser-connections'))"
    );
  });

  it("adds an additive, checked kind defaulting to manual and a short nullable label", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'manual'");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS label text");
    expect(migration).toContain("CHECK (kind IN ('manual','browser'))");
    expect(migration).toContain("CHECK (label IS NULL OR char_length(label) <= 120)");
  });

  it("rebuilds only the capture_tokens view and leaves authentication and other tables alone", () => {
    expect(migration).toMatch(
      /CREATE OR REPLACE VIEW tenant_api\.capture_tokens WITH \(security_barrier=true\) AS\s+SELECT \* FROM public\.capture_tokens\s+WHERE user_id = nullif\(current_setting\('app\.user_id', true\), ''\)::uuid\s+WITH CASCADED CHECK OPTION;/
    );
    expect(migration.match(/CREATE OR REPLACE VIEW/g)).toHaveLength(1);
    expect(migration.match(/ALTER TABLE capture_tokens\b/g)).toHaveLength(5);
    for (const forbidden of [
      "distil_resolve_capture_token",
      "CONCURRENTLY",
      "DROP TABLE",
      "DROP COLUMN",
      "DROP VIEW",
      "DISABLE ROW LEVEL",
      "UPDATE capture_tokens",
      "DELETE FROM",
    ]) {
      expect(migration).not.toContain(forbidden);
    }
  });
});

describe("phone pairing migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "src/lib/postgres/tenant-migrations/0016_phone_pairing.sql"),
    "utf8"
  );
  it("preserves existing credential kinds and binds the pairing token to its tenant", () => {
    expect(migration).toContain("CHECK (kind IN ('manual','browser','phone'))");
    expect(migration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS capture_tokens_user_id_id_idx ON capture_tokens(user_id, id)"
    );
    expect(migration).toContain("FOREIGN KEY (user_id, token_id)");
    expect(migration).toContain("REFERENCES capture_tokens(user_id, id) ON DELETE CASCADE");
    expect(migration).toContain("ON shortcut_pairings(user_id) WHERE consumed_at IS NULL");
    expect(migration).toContain("ALTER TABLE shortcut_pairings FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON shortcut_pairings FROM PUBLIC, distil_runtime");
    expect(migration).toContain("WITH CASCADED CHECK OPTION");
    expect(migration).not.toMatch(/(?:DELETE FROM|UPDATE) capture_tokens/);
  });
  it("exposes only exact active pairing identities to the runtime", () => {
    const resolver = migration
      .split("AS $resolve_shortcut_pairing$")[1]
      .split("$resolve_shortcut_pairing$")[0];
    expect(resolver).toContain("pairing.code_hash = requested_code_hash");
    expect(resolver).toContain("pairing.consumed_at IS NULL");
    expect(resolver).toContain("pairing.expires_at > now()");
    expect(resolver).toContain("pairing.attempts < 5");
    expect(resolver).toContain("account.status = 'active'");
    expect(resolver).toContain("LIMIT 1");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION distil_resolve_shortcut_pairing(text) FROM PUBLIC"
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION distil_resolve_shortcut_pairing(text) TO distil_runtime"
    );
    expect(migration).toContain("SET search_path = pg_catalog, public");
  });
  it("keeps anonymous rate limiting durable and inaccessible as a runtime table", () => {
    expect(migration).toContain(
      "REVOKE ALL ON shortcut_pairing_rate_limits FROM PUBLIC, distil_runtime"
    );
    expect(migration).toContain("RETURNS boolean");
    expect(migration).toContain("clock_timestamp()");
    expect(migration).toContain("interval '15 minutes'");
    expect(migration).toContain("LIMIT 100");
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toContain("RETURN attempt_count <= 10");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION distil_consume_shortcut_pairing_rate_limit(text) FROM PUBLIC"
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION distil_consume_shortcut_pairing_rate_limit(text) TO distil_runtime"
    );
  });
});
