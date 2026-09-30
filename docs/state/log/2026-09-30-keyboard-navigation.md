---
topic: keyboard-navigation
title: Keyboard navigation K1–K4 merged and released
date: 2026-09-30
status: released
branch: claude/keyboard-k1
pr: 101, 103
---

## What changed

All four phases shipped as one squash merge (`67f722c`, PR #101) at Amit's request: shortcut
engine, `?` help dialog and on/off switch, `g`-navigation (K1); `j`/`k`/`o` row navigation on Feed
and Today with the row markup fixed (K2); reader keys, Mark unread (Shift+U) and Copy link
(Shift+C) (K3); Research, report and Settings keys, a Settings shortcuts card, a keyboard-only
e2e spec and `docs/user-guide.md` (K4). Checkpoints "Keyboard navigation K1" to "K4 —
2026-09-30" in `docs/project-state.md` hold the details. The merge auto-deployed (release pin
`unpinned`).

## Verification

Full gate at `ddb3547` is recorded in the K4 checkpoint (244 suites / 1,999 tests, integration
4 suites / 12 tests, extension 12, build compiled, keyboard e2e green). PR #103 (branch
`claude/keyboard-record`, open at the time of writing) records the Production release; its
Production smoke result lives there and was not re-checked here.

## External resources

Vercel Production deployment of `67f722c`, identifier recorded in PR #103.

## Next

- Merge PR #103. Its handoff bullet in `docs/project-state.md` will conflict with the frozen
  handoff; resolve by moving the bullet into a new entry `2026-09-30-keyboard-navigation-release.md`
  under this topic (with `time:`), not by editing `docs/project-state.md`.
