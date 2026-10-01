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

Pending orchestrator verification on the integrated branch.

## External resources

None.

## Next

1. Integrate packages A–D on `claude/capture-triage`.
2. Run the local eval (`npm run eval:triage -- --fixtures-only`, then with `--user-id` against the
   local Docker database) and confirm zero false rejects; otherwise switch the default to
   `shadow`.
3. Open a single PR.
4. Get Amit's authorization to merge (merging to `main` auto-deploys).
