# Contributing to Distil

From zero to a pull request. For the full picture (architecture, session protocol,
authorization boundaries) read [AGENTS.md](AGENTS.md); this file is a summary, not a replacement.

## 1. Set up (one command)

You need **Node 22+**, **Docker Desktop** (running) and **git**. Then:

```bash
git clone https://github.com/amitsharmaak/distil.git
cd distil
npm run setup
```

`npm run setup` installs dependencies, writes `.env.local` with generated local auth secrets,
asks you for a local sign-in password and a Gemini API key (free at
<https://aistudio.google.com/apikey>; Enter skips it), starts a PostgreSQL container and
provisions it. It is safe to re-run. Nothing it writes leaves your machine: `.env.local` is
gitignored and the database is a local Docker volume.

Non-interactive (agents, scripts):

```bash
DISTIL_LOCAL_PASSWORD=<password> GEMINI_API_KEY=<key> npm run setup -- --yes
```

Using an AI coding agent? Paste this single prompt into Claude Code, Codex or similar from the
repository root, and it does everything in this file:

> Set up this repository for local development and show me it running: run `npm run setup`
> (if it needs a password or API key, ask me), then `npm run dev:local`, open
> http://localhost:3000/login and confirm I can sign in. Then read CONTRIBUTING.md and AGENTS.md
> and wait for my first task.

In Claude Code the slash command `/setup-local` does the same.

## 2. Run and use Distil locally

```bash
npm run dev:local        # starts PostgreSQL if needed, then the dev server on :3000
```

- Sign in at <http://localhost:3000/login> with the password you chose during setup.
- Save a URL from <http://localhost:3000/save>. Extraction and summarization run inside the dev
  server (`DISTIL_CAPTURE_DISPATCH=inline`), so a capture goes from queued to ready within a few
  seconds and shows up on Today.
- Browser extension: load `browser-extension/` unpacked at `chrome://extensions`, open its
  Options, set the origin to `http://localhost:3000` and paste a capture token from
  Settings → Capture.
- Edit code; Next.js reloads. Only `.env.local` changes need a restart.
- Start over with a clean database: `npm run db:local:reset`.

Details and the differences from Production are in
[docs/runbooks/local-development.md](docs/runbooks/local-development.md).

## 3. Make a change

Read the current handoff first (`npm run state`) so you know what is in flight.

```bash
git switch -c feat/<short-name> origin/main     # or fix/<short-name>
# ...edit, add tests...
npm run check:quick                              # typecheck + Jest on files related to your change
```

Conventions that CI and review enforce:

- Server-only modules (`src/lib/ai/`, `intelligence/`, `agent/`, `knowledge/`, `postgres/`,
  `capture/`, `auth/`, `database.ts`, `db.ts`) are never imported from `"use client"` components.
- Read environment variables only through `src/lib/config.ts` and the flag module; never
  `process.env` elsewhere.
- Client components call the API through `config.apiBaseUrl`; new clients use `/api/v1/*`.
- Every new route, worker, query or AI context path takes a verified `AuthContext` and is added
  to `docs/authorization-matrix.json` with matching adversarial tests.
- Logs never contain credentials, cookies, URLs with tokens, prompts, content or raw error text
  (`src/lib/logger.ts` conventions).
- AI-generated markdown renders through `react-markdown` + `remark-gfm`; sanitize HTML with
  `content-sanitizer.ts`.
- shadcn/ui primitives go in `src/components/ui/` via `npx shadcn@latest add <component>`.
- Prettier (`printWidth` 100) and ESLint run on changed files; the lint baseline is 10 known
  warnings and zero errors. `npm run format` fixes formatting.

Test file names decide which runner picks them up: `*.unit.test.ts(x)`, `*.component.test.tsx`
(jsdom docblock), `*.contract.test.ts`, `*.security.unit.test.ts`, `*.integration.test.ts`
(PostgreSQL via Testcontainers or `DISTIL_TEST_POSTGRES_URL`), `*.sqlite-integration.test.ts`
(legacy), `*.live.test.ts` (opt-in, contacts real providers). Fixtures live in `tests/support/`;
see [tests/README.md](tests/README.md).

## 4. Send a pull request

1. Add one new file to `docs/state/log/` named `YYYY-MM-DD-<topic>.md` saying what you changed
   and how you verified it. Copy the format from any recent entry there or from
   [docs/state/README.md](docs/state/README.md). Never edit an existing entry. This is how
   work is handed over between people and agents.
2. Run the same gate CI runs:

   ```bash
   npm run check            # lint + typecheck + all deterministic Jest suites + state-log check
   ```

   Add `npm run test:integration` when you touched the database, queries or migrations
   (needs Docker).

3. Commit, push your branch and open the PR against `main`:

   ```bash
   git push -u origin HEAD
   gh pr create --fill          # or open the "Compare & pull request" button on GitHub
   ```

   The PR template asks for what changed, how it was verified, and what is not verified. If
   you do not have write access, fork the repository and open the PR from your fork; CI runs
   the same way.

`main` is protected: the `quality-gate` check must pass, conversations must be resolved, and
history is linear (PRs are squash-merged). If your change crosses auth, capture, queue,
migration or tenant boundaries, add the `full-ci` label to also run PostgreSQL integration,
Playwright and a production build. Merging to `main` deploys to Production, so Amit merges.

## What you cannot do from a clone

Production (`distilai.app`), Neon, Vercel and real invitations are Amit's; nothing in a local
checkout reaches them, and `npm run db:local:reset` refuses any non-localhost database. If a
task needs a cloud change, say so in the PR and leave it to Amit.
