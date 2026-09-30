---
name: finish-task
description: Finish the current Distil task - state-log entry, quality gate, PR, optional squash merge and cleanup. User-invoked only.
disable-model-invocation: true
argument-hint: [merge]
---

Finish the current task following `AGENTS.md` §7.1 and §8. Everything happens on the current
branch in the current worktree; never touch another worktree or branch.

1. **Confirm ownership.** Run `git status -sb` and `git log --oneline origin/main..HEAD`. Stop if
   the branch is `main`, if the tree has changes you did not make, or if the branch already has a
   merged PR (a merged branch is never reused).
2. **Sync.** `git fetch origin --prune` then `git merge origin/main` (never rebase). Resolve
   conflicts in code normally. A conflict in `docs/project-state.md` means the branch predates the
   state log: keep `main`'s version and move the branch's handoff bullet or checkpoint into the
   log entry written in step 3.
3. **Write the state-log entry.** Create one new file
   `docs/state/log/YYYY-MM-DD-<topic>[-<slug>].md` (today's UTC date; reuse the topic of the plan
   being executed, check `npm run state -- --all`). Frontmatter: `topic`, `title`, `date`,
   `status` (`planned`, `in-progress`, `blocked`, `merged`, `released`, `closed`, `ongoing`),
   `branch`, `pr` (once known). Sections: `## What changed` (why, what, SHAs, PR links),
   `## Verification` (locally verified facts separated from previously recorded external state),
   `## External resources` (non-secret identifiers or "none"), `## Next` (exact restart steps and
   who acts). Never edit an existing entry; never edit `docs/project-state.md`. Unfinished work is
   recorded as unfinished. No secrets, personal data or captured content.
4. **Gate.** Run `npm run check` (this includes `npm run state:check`). Run
   `npm run test:integration` when the change touches the database, queries or migrations, and
   the e2e or extension suites when the change touches what they cover. Report results
   faithfully; a failing gate stops the task here with the failure recorded in the entry.
5. **Commit and open the PR.** Commit the code and the log entry together with a conventional
   message. Push with `git push -u origin HEAD` and open the PR against `main` with `gh pr create`;
   the body states what changed, how it was verified, and what is not verified or not deployed.
   Add the PR number to the entry's `pr` field and amend or commit again.
6. **Merge only when asked.** If `$ARGUMENTS` is `merge`, or Amit asked in this task, wait for
   green CI and `gh pr merge --squash --delete-branch`. Merging auto-deploys to Production while
   the release pin is `unpinned`, so this counts as a release under `AGENTS.md` §9. Otherwise
   stop after the PR.
7. **Clean up after a merge.** From the main checkout on `main`: `git fetch origin --prune`,
   `git merge --ff-only origin/main`, then remove this worktree (`git worktree remove <path>`) and
   delete the local branch. Report the merge SHA and remind Amit that Production was not checked
   unless it was.
