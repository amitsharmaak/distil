# CLAUDE.md

Claude Code entry point for the Distil repository. Keep this file short; it points to the shared
sources of truth rather than duplicating them.

## Read first, every session

1. **`AGENTS.md`** — shared working guidance for Claude Code and Codex: product intent, current
   architecture, commands, testing and code conventions, branch/worktree rules, what to record,
   and authorization boundaries. It is the authoritative description of how the system is built
   today.
2. **`docs/project-state.md`** — the canonical roadmap, progress and handoff document. Read the
   **Current handoff** section and the latest dated checkpoints before doing anything, and update
   it after material progress and before handoff. Progress lives only there.

Conversation history is not shared between agents. Repository files are the shared memory.

## Current baseline (verify locally; details in the two files above)

- Production is live at `https://distilai.app` on Vercel with Neon PostgreSQL as the system of
  record. Phases 1–3 (cloud capture, daily knowledge experience, multi-user tenant isolation) are
  complete. Legacy SQLite code in `src/lib/db.ts` is compatibility only.
- `main` is the integration and release branch. Work on short-lived `claude/<task>` branches from
  current `main`, include the state-file update in the same branch, and never overwrite another
  agent's or Amit's uncommitted work.
- Releases, cloud mutations, invitations and data deletion need task-specific authorization from
  Amit for that task; recorded historical approvals are not blanket permission.

## Claude-specific working notes

- Use subagents for broad exploration across many files; keep the main context lean and return
  summaries, not raw file contents.
- Prefer targeted reads of `AGENTS.md` sections and the relevant `docs/` runbook over re-deriving
  architecture from the code.
- Keep secrets, connection strings, personal data and captured content out of files and output.
- Report outcomes faithfully: distinguish implementation complete, locally verified, and deployed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
