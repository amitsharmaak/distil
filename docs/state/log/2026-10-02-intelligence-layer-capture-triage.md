---
topic: intelligence-layer
title: Intelligence plan reconciled with capture triage (#130); Q5 partly delivered, Q1 starts from the 60/40 blend
date: 2026-10-02
time: 08:17
status: planned
branch: claude/distil-intelligence-audit-5ed2f0
pr: 131
---

## What changed

Docs only. The plan in `2026-10-01-intelligence-layer.md` and the decisions in
`2026-10-01-intelligence-layer-decisions.md` were written before capture triage (#130, topic
`capture-triage`). Phase R3 of `2026-10-01-release-train-open-prs-plan.md` puts #130 ahead of this
PR, so this entry records what #130 changes in the plan. The two earlier entries stay as written.

`docs/intelligence-layer.md` §1 now lists the capture priority score and the junk-page check as
delivered by #130, with a short description of the call, and §6.3 names capture triage on the
economy tier.

### Q5 is partly delivered by #130

Delivered: one call per generic article capture (`gemini-3.5-flash-lite`, 8-second timeout) after
extraction and before the brief. A junk verdict rejects the capture with `CONTENT_JUNK` under
guards. A 0–100 score is written to `content_classification.triage` and, for captures with the
default `medium` priority, to `ai_priority_score` and the `priority` bucket.

What remains of Q5:

- The definition of what belongs in Today, written with Amit, and the snapshot of unread items
  rated must, nice or skip.
- The replay against `rank-v1` and newest-first (nDCG@6 and skips in the top six). It now also
  judges the #130 score.
- Topics: the triage call returns none, so `items.topics` stays empty.
- Today's ranking: Today sorting by the score, and the one-line reason replacing "Item priority:
  medium".
- The labelled evaluation on real pages: the junk flag on Q3's junk set with zero false rejects,
  and topics on a labelled subset. #130's evidence is 27 hand-written fixtures.

Q5 extends #130's call and its `triage-v1` prompt; it does not add a second call.

### Decision 8A and Q1 touch the code #130 changed

Decision 8A has Q1 stop `reprioritize` overwriting `items.priority`. #130 changed the same
function (`src/lib/ai/prioritize.ts`): for an item with a triage score it now blends 60% triage
with 40% heuristic, and it still overwrites `priority`. Q1 must start from #130's version and keep
the blend for `ai_priority_score` while removing the overwrite.

The premise of 8A, "Today stays newest-first until Q5", no longer holds once #130 is released: the
triage bucket already orders Today for default-medium captures.

## Verification

- Locally verified: the #130 facts above, read from `gh pr view 130` and `gh pr diff 130` on
  2026-10-02; `npm run state:check` and Prettier on the changed files.
- Not re-checked: whether #130 is merged or released (it was open when this was written), and the
  flag value on Production.

## External resources

None touched.

## Next

- Amit merges #131 after #130 (phase R3). Docs only, no deployment.
- Unchanged from the decisions entry: Amit confirms and enables Gemini billing (decision 1); no
  phase starts until he asks; Q0 is first.
- When Q1 starts, branch from a `main` that contains #130 and apply 8A to the blended
  `reprioritize`.
- When Q5 starts, scope it to the remaining items listed above.
