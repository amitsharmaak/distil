---
name: setup-local
description: Set up this clone of Distil for local development, start it, and confirm sign-in works. User-invoked only.
disable-model-invocation: true
---

Take this checkout from clone to a running local Distil, following `CONTRIBUTING.md` §1–2.

1. **Setup.** Run `npm run setup` from the repository root. It prompts for a local sign-in
   password and a Gemini API key; relay those prompts to the user rather than inventing values.
   If the user cannot answer right now, run
   `DISTIL_LOCAL_PASSWORD=<password-they-gave> npm run setup -- --yes` once they have, and skip
   the key (captures then save without summaries until `GEMINI_API_KEY` is in `.env.local`).
   Fix what the script reports (Node version, Docker not running) and re-run; it is idempotent.
2. **Run.** Start the dev server with the project's preview tooling if available, otherwise
   `npm run dev:local`, and open `http://localhost:3000/login`. Confirm the page renders and that
   signing in with the chosen password lands on Today. Never print the password or anything from
   `.env.local`.
3. **Orient.** Read `CONTRIBUTING.md` and `AGENTS.md` §1–4, run `npm run state` for the current
   handoff, and summarize in a few lines how to make a change and open a PR
   (`feat/<name>` branch, state-log entry, `npm run check`, `gh pr create`).
4. Stop and wait for the user's first task.
