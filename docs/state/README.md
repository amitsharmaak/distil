# Distil state log

The state log replaces the "Current handoff" section of `docs/project-state.md` (frozen on
2026-09-30). It exists to stop merge conflicts: each task **adds a new file** here and never edits
another task's file, so two branches that finish on the same day merge cleanly.

## Rules

1. **Append only.** One task, one new file per checkpoint in `log/`. Never edit, rename or delete
   an existing entry, including your own once it has merged. To correct or advance a topic, add a
   newer entry for the same `topic`.
2. **Latest entry per topic wins.** The handoff is not a file; it is derived. Run `npm run state`
   to print the latest entry of every open topic with its `## Next` section. `--all` includes
   closed topics; `--topic <name>` prints one topic's history.
3. **File name:** `YYYY-MM-DD-<topic>[-<slug>].md`, kebab-case. The date is the day the entry is
   written, in UTC. Add `time: HH:MM` (UTC) when a topic gets two entries on one day.
4. **Topic** is the stable kebab-case name of the stream of work (`chrome-extension-web-store`,
   `admin-invitations`, `production-operations`). Reuse the topic of the plan you are executing;
   check `npm run state -- --all` before inventing one.
5. **No secrets, personal data or captured content.** `npm run state:check` (part of
   `npm run lint`) rejects connection strings and API keys and validates the frontmatter.
6. Rarely changing shared facts (architecture, commands, rules) belong in `AGENTS.md`, not here.
   Long plans stay in the entry that records them; later entries link to that file.

## Entry format

```markdown
---
topic: admin-invitations
title: Admin invitations I1: allowlist and API
date: 2026-10-01
status: merged
branch: claude/admin-invitations-i1
pr: 110
---

## What changed

Why, what, commit SHAs and PR links.

## Verification

Locally verified facts (which commands, which counts), separated from previously recorded
external state (CI, deployments, Neon) that was not re-checked.

## External resources

Non-secret identifiers only, or "none".

## Next

Exact restart steps, decisions awaited, and who acts. Required while the status is open.
```

`status` is one of `planned`, `in-progress`, `blocked`, `merged`, `released`, `closed`, `ongoing`
(a standing topic such as Production operations that never closes) or `archived` (a frozen
snapshot). Distinguish clearly between implementation complete, verified (which checks, where) and
deployed (which deployment, which origin).

## Migration note

Everything recorded before 2026-09-30 stays in `docs/project-state.md`, which is now read-only
history: its dated checkpoints and roadmap are evidence and are never edited again. The handoff as
it stood on 2026-09-30 is preserved verbatim in `log/2026-09-30-handoff-snapshot.md`.
