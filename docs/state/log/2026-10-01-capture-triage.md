---
topic: capture-triage
title: "Capture triage: priority score and junk-page check (in progress)"
date: 2026-10-01
time: "08:27"
status: in-progress
branch: claude/capture-triage
---

## What changed

Picks up the backlog item "capture priority score and junk-page check" recorded in
`2026-10-01-backlog-jev-deferred.md`.

**Design.** One structured call per generic article capture (task `triage-capture`,
`gemini-3.5-flash-lite`, 8-second timeout, one attempt) runs in the tenant capture job after
extraction and before the summary. It returns a kind (`content` or a junk kind: login wall,
paywall stub, consent wall, error page, bot check, empty shell), a readable flag, a confidence and
a 0–100 priority score. The score feeds the item's AI priority; a junk verdict rejects the capture
with `CONTENT_JUNK` only when every guard holds (confidence at least 0.9, under 3,000 readable
characters, no user notes, not sent as high priority, not a second save). Triage fails open: any
error leaves the capture as it is today. `FEATURE_CAPTURE_TRIAGE` defaults on; `shadow` scores
without rejecting; `false` turns it off.

**Contract commit `8775992`** on `claude/capture-triage`: the `triage-capture` AI task, the
`FEATURE_CAPTURE_TRIAGE` flag, the shared types and guards in
`src/lib/contracts/capture-triage.ts`, and a stub `src/lib/ai/triage-capture.ts`.

**Packages, built in parallel against that contract:**

- A: the triage prompt and `triageCapture` / `createTenantCaptureTriage` /
  `triageInputFromText`.
- B: the capture-processor integration (junk rejection, score storage, second-save bypass).
- C: the admin Troubleshooting view of rejected captures with "Save anyway", and the receipt
  message.
- D: the eval (`evals/triage-eval.ts`, `evals/triage-metrics.ts` with unit tests,
  `evals/triage-fixtures.json`, `npm run eval:triage`), the authorization-matrix entry
  `capture-triage`, the AGENTS.md §3 flag and AI notes, and `docs/runbooks/capture-triage.md`.

**Decisions taken, with the recommended defaults:**

- Paywall stubs are junk only at high confidence (the same 0.9 bar), so a page with a real
  opening is kept.
- The default mode is `on`, contingent on a zero-false-reject eval. If the local eval shows any
  false reject, ship with `shadow` instead.
- A second save of a junk-rejected URL keeps it (the junk check is skipped).

Existing behaviour to keep in mind: the feedback "reprioritize" path already rewrites priority for
up to 200 items; it now blends with the triage score instead of the default priority.

## Verification

Locally verified by the orchestrator on the integrated branch (packages A–D merged):

- `npm run check`: 255 suites / 2,190 tests passed, lint 0 errors (5 baseline warnings),
  typecheck clean, state log ok. `npm run test:phase3-isolation` 56/56;
  `npm run audit:phase3-security` passed.
- `npm run eval:triage -- --fixtures-only` against gemini-3.5-flash-lite (local key, no writes):
  27 hand-written pages, 15 junk across all six kinds and 12 tricky real pages. Guarded and raw
  verdicts both 15/15 junk caught, **0 false rejects**. p50 1,360 ms, p95 1,601 ms, $0.0003 per
  call. Score spread: 0–19 ×15 (the junk), 20–39 ×1, 40–59 ×6, 60–79 ×5, 80–100 ×0, so no
  fixture reached `high`.
- Not run: the eval against a real library. The local Docker databases hold 0–3 articles, and
  Production data was not used. The real-library score spread is the open question: if real
  captures also rarely reach 70, triage will mostly move items between `medium` and `low`.
- Not run: a local end-to-end capture through the dev server; the worker behaviour is covered by
  unit tests (junk rejection, fail-open, guards, shadow, second save, priority write).
- Not deployed.

## External resources

None.

## Cold start, measured 2026-10-01 (backlog item, recorded here to keep one PR)

Amit upgraded the Vercel team `pv-1850` to **Pro** after P11, which assumed Hobby. A public
measurement from the orchestrator's Mac (no DB-touching routes, no sign-in) timed
`https://distilai.app/api/health` and `/privacy` warm, after 7 minutes and after 35 minutes
without the orchestrator's traffic: every reading was 0.16–0.36 s except one 0.80 s first
`/privacy` request before any idle. P10 measured multi-second cold loads on Hobby. This fits
Pro's automatic production pre-warming ("scale to one"). Caveats: other traffic in the window
was not excluded, and the Neon wake (~0.76 s after 5 minutes idle on Free) was not exercised.
Amit's signed-in check of Today after 10+ minutes idle decides whether the item closes. Never keep
Neon Free awake with DB pings (182.5 CU-h/month exceeds the 100 CU-h allowance).

## Next

1. Amit reviews the single PR and authorizes the merge (merging to `main` auto-deploys; no
   migration and no environment change are needed).
2. After release, watch Settings → Troubleshooting for `CONTENT_JUNK` rejections and the
   high/medium/low mix of new captures; if real pages are rejected, set
   `FEATURE_CAPTURE_TRIAGE=shadow` in Vercel (Amit's change). If almost nothing reaches `high`,
   recalibrate the prompt's score bands.
3. Cold start: Amit opens Today after 10+ minutes idle; ~1–1.5 s closes the item, multi-second
   reopens the Pro cron warm-up option.
