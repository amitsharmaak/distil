---
topic: reader-x-video
title: Captured X videos play again; PR 146 released to Production
date: 2026-10-05
time: 09:45
status: released
branch: claude/video-playback-issue-8a7274
pr: 146
---

## What changed

PR 146 (squash commit `4aa712e5` on `main`) was merged with Amit's authorization and Vercel
deployed it. The reader page now serves `<meta name="referrer" content="no-referrer">`, so
the native player's request to `video.twimg.com` no longer carries the Distil origin that X's
CDN rejects with 403. The earlier entry `2026-10-05-reader-x-video-cdn-referer.md` has the
diagnosis.

## Verification

- Production, after the deploy: `https://distilai.app/feed/ac11d577-…` renders the
  no-referrer meta tag. Clicking "Play video" no longer yields a `MediaError` (code 4 before the
  fix); the element stays in the loading state with no error.
- Production, visible browser: on `https://distilai.app/sign-in` (which already carries the same
  no-referrer meta tag) a `<video>` for the same `video.twimg.com` MP4 reached `readyState 4`
  with the full 85-minute duration. The MP4 is 1.6 GB with a 5.8 MB header, so the player needs
  several seconds before the first frame.
- Not observed to the first frame on the reader page itself: the only signed-in browser the
  agent could drive (Claude in Chrome) kept the tab hidden behind the Claude app, and Chrome
  defers media loading in hidden tabs (`document.visibilityState === "hidden"`; even a public
  sample MP4 stayed at `readyState 0` there). Amit's own click in a foreground tab is the final
  check.
- Branch `claude/video-playback-issue-8a7274` was deleted on the remote at merge; the local
  worktree still exists and can be removed.

## External resources

none

## Next

1. Amit: open the item in a foreground tab, click "Play video", confirm the clip plays after a
   short buffering spinner. If instead the "Open on X" card appears, the player hit an error;
   note the network status for `video.twimg.com` in a new entry (403 would mean X tightened its
   rule and a server-side proxy is the next option).
2. The 26 pre-existing `npm run typecheck` errors noted in the earlier entry are untouched.
