---
topic: reader-x-video
title: Captured X videos never played in the reader; X's CDN rejects third-party Referers
date: 2026-10-05
status: in-progress
branch: claude/video-playback-issue-8a7274
---

## What changed

Amit reported that the "Play video" control on an X post in the reader
(`/feed/<id>`, an interview clip from an X post) showed an empty player. Diagnosed in his
signed-in Chrome on `distilai.app`: the native `<video>` requested the captured MP4 on
`video.twimg.com` and got **HTTP 403**; the element reported `MediaError` code 4.

Cause, established by request experiments against the same MP4 URL:

- No `Referer`, or `Referer: https://x.com/`: 200 / 206.
- `Referer: https://distilai.app/`: 403 (`retry-after: 0`).
- A `fetch()` from the page with `referrerPolicy: "no-referrer"`: 200.
- `<video referrerpolicy="no-referrer">`: still 403, because `referrerpolicy` is not an attribute
  media elements support. Only the document policy applies to `<video>` requests.
- Injecting `<meta name="referrer" content="no-referrer">` into the live page and recreating the
  player: 206, player loads.

The site-wide `Referrer-Policy: strict-origin-when-cross-origin` header (`next.config.ts`) sends
the origin as Referer, which is exactly what X blocks. It is a hotlink block on X's side, not a
capture defect: the stored MP4 URL is valid and `fxtwitter` returned the best-quality variant.

Fix on this branch:

1. `src/app/feed/[id]/page.tsx` exports `metadata = { referrer: "no-referrer" }`, which Next
   renders as the `<meta name="referrer">` tag on the reader page. A meta tag overrides the
   header for that document. The reader page has no outbound request that needs a Referer.
2. `src/components/feed/video-embed.tsx`: when the native player fires `error`, the disclosure
   falls back to the existing "Open on X" link card instead of leaving a blank player.
3. Tests: `src/components/feed/__tests__/video-embed.component.test.tsx` (native MP4 renders on
   demand; error falls back to the X link) and a `metadata.referrer` assertion in
   `src/app/feed/[id]/__tests__/page.component.test.tsx`.

## Verification

- Locally: the two Jest suites above pass (7 tests). `npm run lint` passes (4 pre-existing
  warnings in unrelated files). `npm run typecheck` reports 26 errors, all in files this branch
  does not touch (`content-cache.tsx`, `feed-list.tsx`, `research/page.tsx`,
  `library-experiences.tsx`, `reader-annotations.tsx`); they are present at the branch base
  `5bd4ee5a` in this worktree and were not investigated here.
- In Production (read-only experiments in Amit's browser, described above): the meta-tag
  mechanism was confirmed to make the same MP4 load. The committed change itself is not deployed.
- Not verified: the Next-rendered `<meta name="referrer">` on a running dev server (no local
  database with a captured X video was set up for this task).

## External resources

none

## Next

1. Amit: review and merge the pull request when CI is green. The merge is a Production release
   and needs his authorization.
2. Amit, after the deploy: open the same item on `distilai.app`, click "Play video", confirm the
   clip plays. If it still fails, the network panel will show whether `video.twimg.com` is
   again returning 403 (then X changed its rule and a server-side proxy is the next option) or
   whether the `<meta name="referrer" content="no-referrer">` tag is missing from the page head.
3. If the 26 pre-existing typecheck errors also appear on `main`, open a separate task for them;
   `npm run check` would fail the PR gate until then.
