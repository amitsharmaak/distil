---
name: start-task
description: Start a new Distil task on its own worktree and branch from fresh origin/main. User-invoked only.
disable-model-invocation: true
argument-hint: [task-name]
---

Start the task named `$ARGUMENTS` following `AGENTS.md` §7. The goal is one session, one
worktree, one branch, always cut from fresh `origin/main`. Do not edit
`docs/project-state.md` at task start; the checkpoint is written by `/finish-task`.

1. **Refuse to start on dirty state.** Run `git status --short`. If the current tree has
   changes that are not yours, stop and report them; never stash, reset or check out over them.
2. **Refresh main.** Run `git fetch origin --prune`. If the current directory is the main
   checkout on `main`, fast-forward it with `git merge --ff-only origin/main`.
3. **Get an isolated worktree.**
   - If the session is already inside a Claude worktree (path contains `.claude/worktrees/`),
     stay there. Confirm the branch is a fresh one for this task (`worktree-<name>` or
     `claude/<name>`) and that it starts at `origin/main`. If the branch already has commits
     from an earlier, merged task, stop and tell Amit; a merged branch is never reused.
   - Otherwise call the `EnterWorktree` tool with the name `$ARGUMENTS`. Claude Code creates
     `.claude/worktrees/$ARGUMENTS` on branch `worktree-$ARGUMENTS` from `origin/main` and
     copies `.env.local` from `.worktreeinclude`.
4. **Make the worktree runnable.** If `node_modules` is missing, run `npm ci`. Confirm
   `.env.local` is present; if not, tell Amit rather than creating one.
5. **Confirm and report.** Print `git status -sb`, `git log --oneline -1` and
   `git worktree list`. State the worktree path and branch name in one line and remind that
   the task ends with `/finish-task`.

Rules that apply for the rest of the task:

- Only this session commits to this branch. Never open it in a second session.
- If `main` moves while you work, sync with `git merge origin/main`, never `git rebase`.
- Keep the branch small and short-lived; merge within a day where possible.
- Ask Amit before any cloud mutation, release or data deletion (`AGENTS.md` §9).
