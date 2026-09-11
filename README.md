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
- **Neon Auth** — magic-link, invitation-gated sign-up (no passwords or social login)
- **Google Gemini / OpenAI / Anthropic** — routed per task through a shared AI router
- **Chrome Extension** (Manifest V3) in `browser-extension/`

## Running locally

You need a local or test PostgreSQL instance.

```bash
# 1. Install dependencies
npm install

# 2. Set environment variables (create .env.local — see scripts/setup.sh for the template)
#    DATABASE_URL             — runtime connection string (restricted role)
#    DATABASE_MIGRATION_URL   — migration connection string (owner role)
#    DISTIL_SESSION_SECRET
#    DISTIL_ALLOWED_ORIGINS
#    NEXT_PUBLIC_API_BASE_URL
#    GEMINI_API_KEY (or another AI provider key)

# 3. Run migrations
npm run db:migrate
npm run db:tenant:migrate

# 4. Start the dev server
npm run dev
# → http://localhost:3000
```

If `DATABASE_URL` is unset, the app falls back to a legacy SQLite database (`src/lib/db.ts`).
This path is **compatibility-only** — it exists to support old local data and is not how the
app is meant to run day to day. Do not build new features against it.

## Commands

```bash
npm run dev                  # Next.js dev server
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
- [docs/project-state.md](docs/project-state.md) — roadmap, status, decisions, next steps
- [docs/vercel-deployment.md](docs/vercel-deployment.md) — deployment topology and environment
  variables
- [docs/runbooks/](docs/runbooks/) — operational runbooks (auth activation, backup/restore,
  account export/deletion, tenant-isolation incidents)
- [tests/README.md](tests/README.md) — test suite layout and conventions

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
