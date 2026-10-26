---
topic: reader-youtube
title: YouTube embed fix, video open by default and honest transcript refusal (#159) released
date: 2026-10-26
status: released
branch: claude/kind-lehmann-ded362
pr: 159
---

## What changed

This entry is docs only; PR #159 was a code release. PR #159 (squash commit `71d626e1`, merged 2026-10-26 13:25 IST) was merged with
Amit's authorization as the third of four PRs merged that day, in this order: #157 (`cbc94ed2`),
#158 (`aef747d8`), #159 (`71d626e1`), #154 (`4efee406`). It carried the code described in
`2026-10-19-reader-youtube-embed-and-transcript.md`: `referrerpolicy` on the YouTube iframe (the
Error 153 fix), the video open by default in the reader, the `TRANSCRIPT_BLOCKED` 502 with an
honest message instead of "no captions", and the optional `YOUTUBE_PROXY_URL` path through
undici's `ProxyAgent` (`src/lib/youtube-fetch.ts`).
The main Quick gate passed on `4efee406`, the head after all four merges, and Vercel deployed
that commit to Production (deployment `2XLjuNcbSYY3uVofohS88nDTsNU9`, status Ready, the
`distilai.app` alias created 2026-10-26 13:28 IST). The merge evidence comes from the session
that ran the merges.

## Verification

Derived from the merge session's report of the commits, the Quick gate and the deployment status.
The 2026-10-19 entry's local results stand (lint, typecheck and the Jest suite passed; the
`referrerpolicy` mechanism was checked in a browser against localhost). Not re-verified on
`distilai.app` after the deploy: that the embed plays on the original item (no Error 153), that
the video is open by default, and that "Load transcript" now says YouTube refused the request
rather than "no captions". The proxied path has never run end to end, and
`YOUTUBE_PROXY_URL` is not set in Vercel, so transcripts from Vercel's egress are still refused.

## External resources

none. No environment variable, Vercel setting or Neon change accompanied the release;
`YOUTUBE_PROXY_URL` is optional and unset.

## Next

1. **Amit decides** whether to buy a residential proxy for YouTube requests and set
   `YOUTUBE_PROXY_URL` (a secret) in Vercel Production so transcripts load from Vercel's egress.
   The next transcript request's log line shows `proxy:on` and which innertube client answered
   (`npx vercel logs --scope pv-1850 --project project-evgf1 --since 7d --query transcript`).
   Without it, transcripts work only from a residential IP (local loop) and the reader says so.
2. If a proxy is not wanted, capturing captions in the browser (the Chrome extension already has
   youtube.com access at capture time) is a separate task.
3. Check the same YouTube item on `distilai.app` once: player loads, video open by default,
   transcript refusal message.
