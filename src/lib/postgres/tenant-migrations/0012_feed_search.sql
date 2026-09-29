-- Inline search F1: the columns the feed query needs for text search (`q`) and the site facet
-- (`site`). Apply only after summary-structure through
-- `db:tenant:migrate -- --stage feed-search`. The feed reads these columns only when a request
-- carries `q` or `site`, so deploying the code before this stage leaves the ordinary feed intact.
--
-- feed_search_vector: weighted title (A), author and publication (B), summary and topics (C).
-- The older items.search_vector (title, summary, topics; unweighted) stays for the legacy
-- /api/items search until F7 removes that path.
-- site: the URL host without a leading www., with twitter.com and mobile hosts folded into x.com.
--
-- Both columns are generated, nullable and additive; adding a STORED generated column rewrites
-- items once under a brief lock, accepted because the library is small (as in 0010). No GIN
-- index on feed_search_vector: `@@` is not leakproof, so under forced row-level security it is
-- evaluated above the security barrier and an index could never serve it (see 0010). Equality
-- on site is leakproof and pushes down, so it gets a tenant-scoped btree.
--
-- Idempotent, inside the ledger transaction. The tenant_api.items view is rebuilt because
-- PostgreSQL expands SELECT * when a view is created. Rollback: recreate the view with the
-- previous column list, DROP INDEX items_user_site_idx, then ALTER TABLE items DROP COLUMN site,
-- DROP COLUMN feed_search_vector.

ALTER TABLE distil_tenant_migrations
  DROP CONSTRAINT IF EXISTS distil_tenant_migrations_stage_check;
ALTER TABLE distil_tenant_migrations
  ADD CONSTRAINT distil_tenant_migrations_stage_check
  CHECK (stage IN ('expand','backfill','contract','lifecycle','returning-auth','perf-indexes','summary-structure','feed-search'));

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS feed_search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A')
    || setweight(
      to_tsvector('english'::regconfig, coalesce(author, '') || ' ' || coalesce(publication, '')),
      'B'
    )
    || setweight(to_tsvector('english'::regconfig, coalesce(summary, '')), 'C')
    || setweight(jsonb_to_tsvector('english'::regconfig, coalesce(topics, '[]'::jsonb), '["string"]'), 'C')
  ) STORED,
  ADD COLUMN IF NOT EXISTS site text GENERATED ALWAYS AS (
    CASE
      WHEN lower(substring(url FROM '^[A-Za-z][A-Za-z0-9+.-]*://(?:[^/?#@]*@)?(?:[wW]{3}\.)?([^/?#:]+)'))
        IN ('twitter.com', 'mobile.twitter.com', 'x.com', 'mobile.x.com')
        THEN 'x.com'
      ELSE lower(substring(url FROM '^[A-Za-z][A-Za-z0-9+.-]*://(?:[^/?#@]*@)?(?:[wW]{3}\.)?([^/?#:]+)'))
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS items_user_site_idx ON items(user_id, site);

-- Same statement as 0007; new columns append after the existing ones, so CREATE OR REPLACE
-- keeps every column the runtime already reads.
CREATE OR REPLACE VIEW tenant_api.items WITH (security_barrier=true) AS
  SELECT * FROM public.items
  WHERE user_id = nullif(current_setting('app.user_id', true), '')::uuid
  WITH CASCADED CHECK OPTION;
ALTER VIEW tenant_api.items OWNER TO distil_migration;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_api.items TO distil_runtime;
