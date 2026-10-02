---
topic: ui-modernization
title: Daily edition UI — second main sync after #125 and the iPhone pairing card restyle
date: 2026-10-02
time: 08:55
status: in-progress
branch: codex/ui-modernization
pr: 132
---

## What changed

Release-train phase R5 preparation (`2026-10-01-release-train-open-prs-plan.md`), done by Claude
Code from a detached checkout of the PR head; the Codex worktree was not touched. The PR is not
merged.

1. **Synced with main again** (`361531f`, a merge, not a rebase). Main now carries #125 (pair the
   iPhone Shortcut without copying a token, squash `8d088c4`).
   - `src/components/capture/token-settings.tsx`: one conflict, one hunk, above the component.
     Kept this branch's `formatDate` import from `@/lib/format` and dropped #125's copy of the
     local helper; took #125's doc comment ("manual capture token"). Everything else merged
     cleanly: #125's `kind` field, the client-side `kind === "manual"` filter and its new copy sit
     inside this branch's restyled card (muted key icon, `border-border bg-muted/40` issued-token
     panel, `min-h-11 min-w-11` buttons, `flex-wrap` button row). Token behaviour is #125's,
     unchanged.
   - `src/app/settings/page.tsx` auto-merged. The Capture tab renders, in #125's order,
     `TokenSettings`, `ConnectedBrowsers`, `IphoneShortcutCard` inside this branch's
     `PageContainer` / `TabsContent space-y-4` layout.
2. **iPhone pairing card matched to the edition shell** (`0e7acab`), class-level only, in
   `src/components/capture/iphone-shortcut-card.tsx`: header icon `text-primary` →
   `text-muted-foreground`; `min-w-11` added beside the existing `min-h-11` on the Get the
   Shortcut, Pair and Disconnect buttons; the retry link button gets `min-h-11 min-w-11 px-0`;
   the pairing-code panel gets `bg-muted/40` like the issued-token panel. No behaviour or copy
   change; #125's tests are untouched.

Left as is, for Amit or Codex to decide: the pairing card still formats dates with its own
`toLocaleDateString` helper (its tests assert that), while the two neighbouring cards use
`formatDate` from `@/lib/format`, so "Paired …" reads in the viewer's locale and "Created …" /
"Connected …" in the fixed `en-US` form. Its Disconnect button is default size; the
connected-browsers one is `size="sm"`.

## Verification

Run locally on `0e7acab` on 2026-10-02:

- `npm run check`: pass (260 suites, 2,296 tests).
- `npm run test:integration` (Testcontainers PostgreSQL): pass, 15 suites, 75 tests.
- `npm run build`: pass.

Not run: Playwright e2e and extension suites, visual checks of the Settings page, the preview
walk in R5 step 4. The full CI gate on the pushed head had not been observed when this was
written.

## External resources

None. The integration containers were created and removed by Testcontainers.

## Next

- Watch the full gate on PR #132 for the pushed head.
- Amit walks the preview (R5 step 4), including Settings → Capture with the pairing card, and
  authorizes the merge as a Production release.
- Still open from the previous entry: confirm that dropping the `Item priority` rank reason is
  intended now that triage sets the bucket.
