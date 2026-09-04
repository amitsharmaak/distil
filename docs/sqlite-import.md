# SQLite to PostgreSQL import

The importer is deliberately read-only by default. It validates the SQLite file, reports row
counts, and does not open a PostgreSQL connection:

```bash
npx tsx scripts/import-sqlite.ts data/distil.db
```

To write, set the unpooled migration connection and opt in explicitly:

```bash
DATABASE_MIGRATION_URL='postgres://...' \
  npx tsx scripts/import-sqlite.ts data/distil.db --execute
```

The write and its verification run in one PostgreSQL transaction. Each imported row is upserted
by its primary key, so rerunning the command is safe. The command verifies every imported key and
prints the source, matched, and total target count for each table before committing.

The importer never modifies the source file. It allowlists application data tables rather than
copying arbitrary SQLite tables. OAuth tokens, the job queue, the publisher queue, SQLite FTS
tables, and unknown tables are excluded. Publisher browser-session directories are also outside
the importer's scope and remain untouched.

Keep the original SQLite database as the rollback source. Run the dry run and review its excluded
and ignored table list before using `--execute` against preview or production.
