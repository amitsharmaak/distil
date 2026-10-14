---
topic: release-train
title: Release close-out — #143, #144, #145 and #148 merged and deployed; remaining manual checks listed for Amit
date: 2026-10-14
status: released
branch: claude/epic-cerf-9ec76a
---

## What changed

Docs only. Four topics whose last entry still read `in-progress` have since been merged to `main`
and deployed to Production: `account-export`, `contributor-onboarding`, `ui-modernization` and
`ai-router-auth-fallback`. This entry records the merges with their commits and marks the topics
released, following the pattern of `2026-10-02-release-train-closeout.md` (#137). The handoff is
derived per topic, so each of the four topics also gets a short `released` entry dated today
that points back here; without those files `npm run state` would keep listing them as open.

`reader-x-video` (#146, `4aa712e5`, merged 2026-10-05 10:18 UTC, deployed) is **not** closed
here: the open docs PR #147 (`2026-10-05-reader-x-video-released.md`) already records that
release and its remaining check. Merge #147 as is.

### Merges (squash commits on `main`, UTC times from `gh`)

| PR   | Commit     | Merged (UTC)     | Topic                     | What                                                           |
| ---- | ---------- | ---------------- | ------------------------- | -------------------------------------------------------------- |
| #143 | `5bd4ee5a` | 2026-10-03 04:56 | `account-export`          | Reauthentication link completes through the sign-in route      |
| #145 | `27ce026f` | 2026-10-05 08:22 | `ui-modernization`        | Lockup gap 24 units, sidebar mark aligned, Mark read secondary |
| #144 | `d40d64f2` | 2026-10-05 08:28 | `contributor-onboarding`  | `npm run setup`, `CONTRIBUTING.md`, PR template                |
| #148 | `c587da15` | 2026-10-13 07:15 | `ai-router-auth-fallback` | Router falls back to Gemini on a rejected Anthropic key        |

`origin/main` is at `c587da15`. Each merge produced a Vercel Production deployment whose GitHub
deployment status is `success` (recorded within a minute of each merge). Merging was Amit's
authorization for each release; this entry changes nothing in Production.

### What remains, per topic

The items below are the post-release checks from each topic's last entry that nobody has
recorded as done. They are Amit's unless stated otherwise.

**`account-export`** (last entry `2026-10-03-account-export-reauthentication-link-never-refreshed-session.md`)

1. On `distilai.app`, signed in: open Account, click "Request export"; if the fresh-authentication
   notice appears, click "Email verification link", open the link in the same browser, confirm the
   page shows "You're verified for the next 10 minutes", click "Request export" again and confirm
   one new export row appears. Nobody has yet run this sequence on Production.
2. If the page instead says "The link didn't start a new session", the provider kept the old
   session over the verifier (Vercel logs show `reauthentication_session_not_renewed`). Record it
   in a new entry; the fix is to revoke the current session before the exchange.
3. Still open from `2026-10-02-account-export-fixes.md` and not recorded as done: the Vercel
   Production variables `DISTIL_OBJECT_STORE_PROVIDER=vercel-blob` and
   `DISTIL_OBJECT_STORE_ENVIRONMENT` (export completion depends on them), the `ready` → Download
   → ZIP check afterwards, and the decision on how the seven-day purge of export objects and the
   account-deletion job are triggered.
4. Review follow-ups (a)–(c) in the 2026-10-03 entry (clear the minted session on a bound-subject
   mismatch; the cosmetic `?reauthenticated=1` marker; pre-deploy links refused for 15 minutes)
   are recorded, not implemented.

**`contributor-onboarding`** (last entry `2026-10-03-contributor-onboarding.md`)

1. Try `npm run setup` once on a second machine or a fresh clone, then hand new contributors
   `CONTRIBUTING.md` plus repository access.
2. Not verified by the task: a machine without a warm npm cache or Docker image, Windows (bash
   script; WSL expected), and the interactive "wipe the database?" prompt on a re-run.
3. `.claude/launch.json` is gitignored and references feature flags that no longer exist;
   harmless, local only.

**`ui-modernization`** (last entry `2026-10-05-ui-modernization-logo-gap-and-reader-bar.md`)

1. Decide whether the green "Mark unread" read state in the reader bar is the accent wanted, or
   whether the label should stay muted with only the check coloured. The merge shipped the green
   state; if not wanted, it is a small follow-up task.
2. Not re-checked on Production by the task: the 24-unit lockup gap and the aligned sidebar mark
   were measured locally only.

**`ai-router-auth-fallback`** (last entry `2026-10-09-ai-router-auth-fallback-anthropic-key.md`)

1. After the deploy, a detailed summary on `distilai.app` should use Claude with the
   workspace-scoped `ANTHROPIC_API_KEY` Amit saved on 2026-10-13. If the Vercel logs show
   `provider_auth_fallback` instead, the saved key differs from the one that passed the local
   audit; re-check with `npm run audit:ai-models` and update Vercel again.
2. The fallback was never exercised against a real rejected key; the first Production evidence
   either way is the absence or presence of `provider_auth_rejected` in the logs.

## Verification

- Derived for this entry from `gh` and git on 2026-10-14: the four merge commits and merge times,
  #146's merge, #147 open, `origin/main` at `c587da15`, and the GitHub deployment statuses
  (`Production`, `success`) that Vercel's Git integration recorded for each of the five commits.
- Not re-checked here: anything on `distilai.app`, the Vercel environment, or the Neon database.
  No Production observation is claimed for the four topics beyond the deployment status.
- Local for this branch: `npm run state:check`, Prettier on the new files, and `npm run state`
  no longer lists the four topics under Open.

## External resources

None touched. The Vercel deployment identifiers were read from GitHub's deployment records only.

## Next

The four topics are released; the remaining checks above belong to them and are repeated in the
short `released` entries added for each topic today. Nothing further for this entry.

1. Amit merges #147 (docs only) so `reader-x-video` reads released as well.
2. The follow-ups still open from the 2026-10-02 close-out (Chrome Web Store review, iPhone
   Shortcut, the stale Preview alias, the intermittent 503) are unchanged and stay with their
   topics.
