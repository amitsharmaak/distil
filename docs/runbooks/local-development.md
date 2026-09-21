# Local development loop

Run the whole product on a laptop against a throwaway PostgreSQL, capture articles, change the
UI, and reload. Nothing here touches Neon, Vercel or Production. Deploy once a batch of fixes is
ready by merging to `main`.

## One-time setup

1. Install Docker Desktop and run `npm install`.
2. Copy `.env.local.example` to `.env.local`.
3. Generate the auth values and paste the three printed lines into `.env.local`:

   ```bash
   npm run local:secrets -- <your-local-password>
   ```

   The password hash is printed with `\$` escapes because Next's env loader expands `$name`
   sequences, even inside quotes. Paste it exactly as printed.

4. Add at least one AI provider key (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`).
5. Provision the database:

   ```bash
   npm run db:local:reset
   ```

## Daily loop

```bash
npm run dev:local        # starts Postgres if needed, then next dev on :3000
```

- Sign in at `http://localhost:3000/login` with the password you chose. Hosted Neon Auth stays
  off locally (`FEATURE_NEON_AUTH=false`), so the legacy password login is the only sign-in.
- Save a URL from `/save`, the browser extension, or `POST /api/v1/captures`. With
  `DISTIL_CAPTURE_DISPATCH=inline` the capture worker runs inside the dev server right after the
  request is accepted, so no Vercel Queue credentials are needed. A capture normally goes
  `queued → ready` within a few seconds; failures are logged by the dev server.
- Browser extension: load `browser-extension/` unpacked (see its README), set the origin to
  `http://localhost:3000`, and paste a capture token created on the local Settings page. The
  same extension switches back to Production by changing the origin and token.
- Edit code; Next reloads. Only `.env.local` changes need a server restart.

## Start from scratch

```bash
npm run db:local:reset   # drops both schemas, re-applies every migration, re-creates the owner
```

The reset refuses any non-loopback database host, so it cannot run against Neon. To also delete
the Docker volume: `npm run db:local:down && docker volume rm distil-local_distil-local-postgres`.

## What the local environment differs in

| Concern      | Local                                        | Preview / Production             |
| ------------ | -------------------------------------------- | -------------------------------- |
| Database     | Docker `postgres:16` on port 5433            | Neon, pooled runtime URL         |
| Runtime role | `distil_app`, member of `distil_runtime`     | Neon runtime role                |
| Capture      | `DISTIL_CAPTURE_DISPATCH=inline`, in-process | Vercel Queue `capture-requests`  |
| Research     | same switch: stages run in-process, chained  | Vercel Queue `research-runs`     |
| Auth         | Legacy password login, one owner user        | Hosted Neon Auth                 |
| Tenant jobs  | Not dispatched (no local consumer)           | Vercel Queue `account-lifecycle` |

Never set `DISTIL_CAPTURE_DISPATCH=inline` on Vercel: serverless request lifetimes end before the
worker finishes. Deep research follows the same switch: locally each stage (plan, one search per
sub-question, gaps, one deepening question per gap, synthesis) runs in the dev server process
and schedules the next one; a thrown stage is redelivered after 2 s, at most four times. Google
Search grounding needs a Gemini key whose project has that quota; without it the search stages
log `research_search_grounding_fallback` and answer from model memory.

## Ship a batch

```bash
npm run check            # Tier 1 gate: lint + typecheck + jest
```

Open a PR from the `claude/<task>` branch to `main`. While the release pin is `unpinned`, merging
auto-deploys to Production.
