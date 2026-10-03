# Distil

Distil is a personal knowledge-consumption app. It turns intentional capture into a calm,
prioritized daily knowledge experience:

> capture (desktop / iPhone) → durable ingest → extract, summarize, organize, prioritize → read →
> search, ask, revisit.

Connectors are inputs, not the goal — the product is a reliable capture pipeline, useful
summaries, a good reading experience, and traceable answers.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4** + **shadcn/ui**
- **PostgreSQL on Neon** — system of record, with row-level security for tenant isolation
- **Vercel** (hosting) + **Vercel Queue** — capture ingestion and background processing
- **Neon Auth** — magic-link or email/password sign-in, invitation-gated sign-up (no social login)
- **Google Gemini / OpenAI / Anthropic** — routed per task through a shared AI router
- **Chrome Extension** (Manifest V3) in `browser-extension/`

## Running locally

One command takes a fresh clone to a running app (needs Node 22+ and Docker Desktop):

```bash
npm run setup                               # deps, .env.local with local secrets, Postgres, migrations
npm run dev:local                           # http://localhost:3000 — sign in with the password you chose
```

Setup asks for a local sign-in password and a Gemini API key; re-running it is safe. The
step-by-step version, the manual path and the differences from Production are in
`docs/runbooks/local-development.md`. To point at another PostgreSQL instead, run
`npm run setup -- --skip-db`, set `DATABASE_URL` (restricted role) and `DATABASE_MIGRATION_URL`
(owner role) in `.env.local`, and run `npm run db:migrate` and `npm run db:tenant:migrate`.

If `DATABASE_URL` is unset, the app falls back to a legacy SQLite database (`src/lib/db.ts`).
This path is **compatibility-only** — it exists to support old local data and is not how the
app is meant to run day to day. Do not build new features against it.

## Commands

```bash
npm run setup                # one-command local setup (safe to re-run)
npm run dev:local            # Postgres + Next.js dev server
npm run dev                  # Next.js dev server only
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint + prettier check
npm run format                # prettier --write .
npm test                     # all deterministic Jest suites
npm run test:coverage        # coverage gate on changed code
npm run test:e2e             # Playwright web + mobile
npm run build                # activation preflight + next build
npm run db:migrate           # Phase 1–2 migrations
npm run db:tenant:migrate    # Phase 3 tenant migrations
```

See [AGENTS.md](AGENTS.md) §4 for the full, verified command list.

## Capture clients

- **Browser extension** (`browser-extension/`, Chrome MV3) — posts captures to
  `POST /api/v1/captures` using a capture token, with offline replay if the API is unreachable.
- **iPhone Shortcut** — see [docs/iphone-shortcut.md](docs/iphone-shortcut.md).

Gmail, Slack, and the authenticated-publisher connector framework exist in the codebase but are
disabled in hosted deployments (`FEATURE_CONNECTORS=false`), so their routes return 404 there.

## Documentation

- [AGENTS.md](AGENTS.md) — shared working guidance and current architecture (source of truth)
- [docs/state/](docs/state/README.md) — append-only state log; `npm run state` prints the current handoff
- [docs/project-state.md](docs/project-state.md) — roadmap and history through 2026-09-30 (frozen)
- [docs/vercel-deployment.md](docs/vercel-deployment.md) — deployment topology and environment
  variables
- [docs/runbooks/](docs/runbooks/) — operational runbooks (auth activation, backup/restore,
  account export/deletion, tenant-isolation incidents)
- [tests/README.md](tests/README.md) — test suite layout and conventions

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md): setup, local use, conventions and how to open a PR.

## License

MIT — see [LICENSE](LICENSE).
