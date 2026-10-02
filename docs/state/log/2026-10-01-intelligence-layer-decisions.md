---
topic: intelligence-layer
title: Intelligence layer decisions answered (1A 2A 3A 4A 5B 6A 7B 8A)
date: 2026-10-01
time: 09:32
status: planned
branch: claude/distil-intelligence-audit-5ed2f0
pr: 131
---

## What changed

Amit answered the eight decisions of the plan in `2026-10-01-intelligence-layer.md` in chat on
2026-10-01, one at a time. He also said not to start any execution; no phase has been started.

1. **1A** Gemini billing: Amit confirms the billing state and enables billing on the Production
   Google AI project before any phase starts.
2. **2A** Scorecard (Q0): an admin-only "Intelligence" card in Settings → Troubleshooting, backed
   by a counts-only route. No script.
3. **3A** Labelling: Amit gives about an hour once (a pass over each area's list, 20 briefs graded
   good or bad with a reason, one snapshot of unread items rated must, nice or skip) and about 15
   minutes a month.
4. **4A** Private items in evals: allowed by item id, read from Amit's own account at run time;
   labels in the database or an ignored file; results hold metrics and ids only. Nothing captured
   enters git.
5. **5B** Judge model: `claude-sonnet-5-5` alone. No second judge.
6. **6A** Unreachable code (Q2): delete the unreachable AI code and the synthetic eval set. The
   connector pipeline stays.
7. **7B** Scheduled evals (Q7): local runs only. No provider keys in GitHub and no scheduled
   workflow.
8. **8A** Thumbs rewriting `priority`: stop it in Q1. A rating keeps updating `ai_priority_score`
   but no longer overwrites `priority`, so Today stays newest-first until Q5.

### What the answers change in the plan

- **Q4, from 5B.** The judge is never the model under test, and `claude-sonnet-5-5` is a candidate
  in two of the Q4 comparisons (short briefs on `gemini-3.5-flash-lite` against `gemini-3.8-flash`
  and `claude-sonnet-5-5`; `claude-sonnet-4-6` against `claude-sonnet-5-5`). Those two comparisons
  need another grader, for example Amit's own blind grading or a different model for that
  comparison only. Not decided; settle it when Q4 starts.
- **Q7, from 7B.** The scheduled workflow, the CI secrets and the automatic regression issue are
  dropped. Q7 keeps the outcome metrics on the scorecard, the extension of
  `npm run audit:ai-models` to list newer models and shutdown dates, the monthly model watch and
  the move to `@google/genai`. Model-backed suites run when Amit or an agent starts them, so a
  change in a provider's model is noticed at the next local run. A scheduled task on Amit's own
  machine would restore an unattended run without keys in GitHub; it is an option to raise at Q7,
  not a decision.
- **Q1, from 8A.** Q1 also changes `reprioritize` so that it stops overwriting `items.priority`.
- **Q0, from 2A,** and **Q2, from 6A,** are as written in the plan.

`docs/intelligence-layer.md` now states the judge (§5.8, §6.3), the local-only cadence (§5.10) and
the billing decision (§6.2).

## Verification

Docs only. `npm run state:check` and Prettier pass on the changed files. No code, migration,
deploy or paid model call.

## External resources

None touched.

## Next

- Amit confirms and enables billing on the Production Google AI project (decision 1). Nothing
  else is waiting on him.
- No phase starts until Amit asks. When he does, Q0 is first, as its own task from current `main`,
  using the briefs in `2026-10-01-intelligence-layer.md` as amended above.
- At the start of Q4, settle who grades the two comparisons in which `claude-sonnet-5-5` is a
  candidate.
