---
topic: reader-youtube
title: YouTube embeds showed Error 153; transcripts refused from Vercel; video open by default
date: 2026-10-19
status: in-progress
branch: claude/youtube-videos-not-playing-2af37f
---

## What changed

Amit reported two things on a YouTube item in the reader (`/feed/<id>`): the embedded player
showed "Video player configuration error, Error 153", and "Load transcript" answered "This
video has no captions to load" for a video that has captions. He also asked for the video to
be open by default instead of behind the "Play video" disclosure.

### Error 153: the embed inherited the reader page's `no-referrer`

PR #146 (`2026-10-05-reader-x-video-cdn-referer.md`) made the reader page `no-referrer` so
X's video CDN would serve captured MP4s. The YouTube iframe inherits the document policy, and
YouTube's player now refuses an embed that arrives without a Referer; its Error 153 is exactly
"missing Referer". Both needs coexist: `referrerpolicy` is an attribute iframes support (unlike
`<video>`), and it overrides the document policy for that one request.

- `src/components/feed/video-embed.tsx`: the YouTube iframe carries
  `referrerPolicy="strict-origin-when-cross-origin"`, so YouTube receives the origin only.
- `src/app/feed/[id]/page.tsx`: the comment on the `no-referrer` metadata names the iframe as
  the one request that opts back in.

### Video open by default

`VideoDisclosure` starts expanded; the control reads "Hide video" and still unloads the player
when collapsed, and "Play video" brings it back. Native X MP4s start playing on open as before
(the element keeps `autoPlay`; browsers that block autoplay with sound show the controls).

### Transcript: YouTube refuses Vercel's egress, and the message said "no captions"

The transcript route logs each innertube client's answer. Production (Vercel runtime logs,
`vercel logs --query transcript`, 7 days) shows both attempts since 2026-10-14 ending the same
way, from two regions (`arn1`, `bom1`):

```
ANDROID:LOGIN_REQUIRED . IOS:LOGIN_REQUIRED . TVHTML5_SIMPLY_EMBEDDED_PLAYER:ERROR . WEB:LOGIN_REQUIRED
```

`LOGIN_REQUIRED` is YouTube's "sign in to confirm you're not a bot" wall for datacenter IPs. The
same code, run from a laptop, returns the captions for the same video on the first client. Two
server-side alternatives were tried locally and ruled out: YouTube's transcript-panel endpoint
(`youtubei/v1/get_transcript`, with params taken from `youtubei/v1/next` and with every client
and visitor-id variant) answers `FAILED_PRECONDITION` without a browser session, and the Data
API's captions methods need the video owner's OAuth. This matches what yt-dlp and
youtube-transcript-api document: the datacenter block is by IP, and the remedy they give is a
residential proxy for the YouTube requests.

- `src/lib/youtube-fetch.ts` (new): `youtubeFetch()` returns the global fetch, or, when
  `YOUTUBE_PROXY_URL` is set, undici's fetch through a `ProxyAgent` so only YouTube traffic
  takes the proxy. undici (already in the tree as a dev dependency, 8.10.2) becomes a runtime
  dependency and is imported lazily, only when a proxy is configured.
- `src/lib/config.ts` and `.env.local.example`: `YOUTUBE_PROXY_URL` (optional; a secret, never
  logged). `src/lib/phase2/video-transcript.ts` and `src/lib/capture/worker.ts` use
  `youtubeFetch()` for the transcript and the innertube details fallback.
- `loadVideoTranscript` now tells a refusal apart from a video without captions:
  `youtubeRefused(attempts)` is true when no client reached a playable answer. The route then
  returns `TRANSCRIPT_BLOCKED` 502 with "YouTube refused the request from Distil's server. The
  captions exist; try again later." instead of the misleading 404. `ReaderError` gains that code
  and status. The log line's `status` field is prefixed with `proxy:on` / `proxy:off`.
- Tests: `src/lib/__tests__/youtube-fetch.unit.test.ts` (new), the refusal case in
  `src/lib/phase2/__tests__/video-transcript.unit.test.ts`, and the updated disclosure tests in
  `src/components/feed/__tests__/reader-experience.component.test.tsx` and
  `video-embed.component.test.tsx` (open by default, `referrerpolicy` on the iframe).

## Verification

- `npm run lint`, `npm run typecheck` and the full Jest suite pass locally (276 suites, 2475
  tests; the 4 lint warnings are pre-existing, in unrelated files).
- The referrer mechanism was checked in a browser with a static page that declares
  `no-referrer` like the reader and embeds the same video (`4mTLpuQpB80`) twice: the plain
  iframe showed Error 153, the one with `referrerpolicy="strict-origin-when-cross-origin"`
  loaded the player (2026-10-19, built-in browser, served from localhost).
- Not verified: the proxied path end to end (no residential proxy is available locally; from a
  laptop the unproxied path already returns captions, which the earlier run confirmed with 60
  segments for a test video). Not verified on `distilai.app`: nothing is deployed.

## External resources

- Production runtime logs: `npx vercel logs --scope pv-1850 --project project-evgf1 --since 7d
--query transcript` (the CLI on this machine is logged in).

## Next

1. Amit: review and merge the pull request when CI is green; the merge is a Production release
   and needs his authorization. After the deploy the embed should play on the same item and
   "Load transcript" should say YouTube refused rather than "no captions".
2. Amit decides whether to buy a residential proxy for YouTube requests (Webshare and similar
   sell rotating residential endpoints; a few dollars a month at Distil's volume) and sets
   `YOUTUBE_PROXY_URL` in Vercel Production. The next transcript request's log line shows
   `proxy:on` and which client answered. Without it, transcripts work only when Distil runs
   from a residential IP (local loop), and the reader says so honestly.
3. If a proxy is not wanted, the alternative is capturing captions from the browser side (the
   Chrome extension already has youtube.com access at capture time); that is a separate task.
