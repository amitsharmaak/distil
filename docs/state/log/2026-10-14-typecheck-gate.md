---
topic: typecheck-gate
title: The 26 typecheck errors were a stale node_modules, not a code defect
date: 2026-10-14
status: merged
branch: claude/typecheck-gate
---

## What changed

No source change. The 2026-10-05 `reader-x-video` entry recorded 26 `npm run typecheck` errors
on `main` in five files this branch does not touch (`src/lib/client-cache/content-cache.tsx`,
`src/components/feed/feed-list.tsx`, `src/app/research/page.tsx`,
`src/components/phase2/reader-annotations.tsx`, `src/components/phase2/library-experiences.tsx`)
and asked for a separate task. This task reproduced them at `origin/main` (`c587da15`) and found
the cause before touching any file:

- The first error in the list is `TS2307: Cannot find module '@tanstack/react-query'`. The
  other 25 are `TS7006`/`TS7031` implicit-any errors on the callbacks and binding elements
  (`query`, `signal`, `key`, `value`, `item`, `report`, `annotation`, …) whose types come from
  that package; without it every `useQuery` result and `QueryClient` callback is untyped.
- `@tanstack/react-query@^5.104.0` has been a dependency since PR 129 (`bbad8255`,
  2026-10-02). The `node_modules` in this worktree was a copy dated 2026-09-30 from the main
  checkout, made before that PR; the main checkout's `node_modules` lacks the package too.
- CI runs `npm ci` before `npm run check` and the Quick gate and Full gate on `c587da15` are
  green (2026-10-13), so `main` was never failing the gate. The 2026-10-09
  `ai-router-auth-fallback` entry had already noted the same cause in passing.

Adding explicit types to those call sites would have hidden the real problem and duplicated
types the package already provides, so the code is left as it is. Two documentation changes:

- `AGENTS.md` §7.1: the worktree bullet now says how to recognise a stale install (`Cannot find
module` followed by implicit-any errors in untouched files, or Jest suites failing to load a
  package) and to run `npm ci` before treating it as a code defect.
- This entry, which closes the request from the 2026-10-05 entry.

## Verification

Locally verified in this worktree at `c587da15` plus the docs change:

- Before `npm ci`: `npm run typecheck` reported the 26 errors listed above (same files, same
  counts as the 2026-10-05 entry).
- `npm ci` (Node 22.23.2, npm 10.9.8) installed 1405 packages from the lockfile; afterwards
  `npm run typecheck` reports 0 errors.
- `npm run check` (lint, typecheck, `npm test`) passes. ESLint 0 errors and the 4 pre-existing
  warnings (`pack-extension.ts`, `intelligence/analyzer.ts`, `intelligence/extractor.ts`,
  `queue/dispatchers.ts`); typecheck 0 errors; Jest 271 suites, 2428 tests passed.
- `npm run state:check` passes with this entry.

Previously recorded external state, not re-checked here: the Quick gate and Full gate runs on
`main` at `c587da15` were green on 2026-10-13 (`gh run list --branch main`).

## External resources

None. No cloud, Vercel or Neon resource was touched.

## Next

- Amit: merge the pull request (docs only; no runtime change, nothing to deploy).
- Anyone whose main checkout or worktree still shows these errors: run `npm ci` there. The
  main checkout at `/Users/amitsharma/Projects/distil` had the stale install on 2026-10-14 and
  was left untouched by this task.
