---
topic: contributor-onboarding
title: One-command local setup and contributor PR path
date: 2026-10-03
status: in-progress
branch: claude/git-repo-local-setup-527da2
---

## What changed

Goal: anyone given access to the repository can build and run Distil locally, use it, change
it and open a PR from a single command or a single agent prompt.

- `scripts/setup.sh` (`npm run setup`) rewritten from a stale env-template printer into the
  real bootstrap: checks Node 22+ and Docker, `npm ci`, copies `.env.local.example` to
  `.env.local`, generates the auth secrets via `scripts/local-secrets.ts`, prompts for a local
  password and a `GEMINI_API_KEY` (or reads `DISTIL_LOCAL_PASSWORD` / `GEMINI_API_KEY` with
  `--yes`), starts the compose PostgreSQL and runs `scripts/local-db-reset.ts`. Idempotent:
  keeps an existing `.env.local`, fills only empty values, asks before wiping an existing
  database (`--reset-db`, `--skip-db`, `--help`).
- `scripts/setup-env.mjs`: writes `SET_<KEY>` values into `.env.local` verbatim so the `\$`
  escaped password hash survives.
- `docker-compose.yml`: project name, container name and host port overridable via
  `DISTIL_LOCAL_PROJECT`, `DISTIL_LOCAL_DB_CONTAINER`, `DISTIL_LOCAL_DB_PORT` (defaults
  unchanged) so a second checkout can run side by side; `setup.sh` points the URLs at the
  custom port.
- `CONTRIBUTING.md` rewritten as the clone-to-PR path: one command, the single agent prompt,
  local use, conventions, state-log entry, `npm run check`, push and `gh pr create`, fork
  fallback, what a clone cannot reach. `README.md` and
  `docs/runbooks/local-development.md` point at `npm run setup`; the manual steps stay in the
  runbook.
- `.github/pull_request_template.md` (what changed / verified / not verified) and the
  Claude Code skill `/setup-local` (`.claude/skills/setup-local/SKILL.md`).

## Verification

Locally verified on 2026-10-03:

- Fresh copy of the branch (no `node_modules`, no `.env.local`) in a scratch directory with
  `DISTIL_LOCAL_PROJECT`/`_DB_CONTAINER`/`_DB_PORT=5499` overrides: `npm run setup -- --yes`
  completed (deps, env, secrets, compose up, provision). Second run kept env and database.
  `next dev -p 3123`: `/login` 200, wrong password 401, right password 200 with session
  cookie, `/` 200 signed in. Test container and volume removed afterwards; Amit's
  `distil-local-postgres` on 5433 untouched.
- `docker compose config` with and without overrides resolves to the expected names and port.
- `npm run check` in this worktree: lint, state check, typecheck and Jest green (269 suites,
  2408 tests). `--help`, the interactive prompt path with `--skip-db`, and an unknown flag
  were exercised in the scratch copy as well.

Not verified: a clone on a machine without a warm npm cache or Docker image (only timing
differs), Windows (the script is bash; WSL expected), and the interactive "wipe the
database?" prompt on a re-run.

## External resources

none

## Next

- Amit: review and merge the PR. Afterwards, try `npm run setup` on a second machine or a
  fresh clone once, and hand new contributors `CONTRIBUTING.md` plus repository access.
- `.claude/launch.json` is gitignored and references feature flags that no longer exist;
  harmless, local only.
