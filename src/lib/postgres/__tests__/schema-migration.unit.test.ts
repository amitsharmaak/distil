import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "src/lib/postgres/migrations/0001_phase1.sql"),
  "utf8"
);

describe("Phase 1 PostgreSQL migration", () => {
  it("defines all legacy and capture tables", () => {
    const tables = [...migration.matchAll(/CREATE TABLE ([a-z_]+)/g)].map((match) => match[1]);
    expect(tables).toHaveLength(21);
    expect(tables).toEqual(
      expect.arrayContaining([
        "items",
        "oauth_tokens",
        "ai_summaries",
        "feedback",
        "research_reports",
        "research_suggestions",
        "user_settings",
        "notifications",
        "item_embeddings",
        "audit_log",
        "workflow_runs",
        "agent_actions",
        "approval_queue",
        "chat_conversations",
        "chat_messages",
        "job_queue",
        "publisher_queue",
        "raw_content",
        "capture_requests",
        "capture_tokens",
        "rate_limit_windows",
      ])
    );
  });

  it("uses durable native types and deletion behavior", () => {
    expect(migration).toMatch(/expiry_date bigint/);
    expect(migration).toMatch(/is_read boolean NOT NULL DEFAULT false/);
    expect(migration).toMatch(/created_at timestamptz NOT NULL/);
    expect(migration).toMatch(/topics jsonb NOT NULL/);
    expect(migration).toMatch(/REFERENCES items\(id\) ON DELETE CASCADE/);
    expect(migration).toMatch(/REFERENCES items\(id\) ON DELETE SET NULL/);
  });

  it("enforces canonical URL and active capture uniqueness atomically", () => {
    expect(migration).toMatch(/normalized_url text UNIQUE/);
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX capture_active_url_idx ON capture_requests\(normalized_url\)[\s\S]*WHERE status IN \('queued','processing','ready'\)/
    );
  });

  it("uses GIN search and validates JSON and capture state values", () => {
    expect(migration).toMatch(/CREATE INDEX items_search_idx ON items USING gin\(search_vector\)/);
    expect(migration).toMatch(/jsonb_typeof\(topics\) = 'array'/);
    expect(migration).toMatch(
      /capture_status_check CHECK \(status IN \('queued','processing','ready','rejected','failed'\)\)/
    );
    expect(migration).toMatch(/capture_attempts_check CHECK \(attempts >= 0\)/);
  });
});
