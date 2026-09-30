---
topic: handoff-snapshot
title: Handoff as it stood in docs/project-state.md on 2026-09-30 (frozen)
date: 2026-09-30
status: archived
---

This is the "Current handoff" section of `docs/project-state.md` as it stood at `b8800b2` (PR #105)
when the state log was introduced, copied verbatim. It is history: each open topic in it has its
own entry in this directory, and those entries are the current view. The section text below
mentions "below" and "this file" meaning `docs/project-state.md`, where every checkpoint it names
still lives.

## Snapshot

- **Active objective:** Three recorded plans await Amit's go-ahead: the Chrome extension
  token-free sign-in and Web Store listing (X1–X3, below), the iPhone Shortcut without a visible
  token (D1–D3, below, which builds on X1's token kinds) and admin invitations from Settings
  (I1–I3, below). The app-slowness plan P8–P11 is closed (P8–P10 live, P11 the authorized
  no-change decision). Keyboard navigation K1–K4 is merged (`67f722c`, PR #101); PR #103 records
  its Production release. Phase 4 (mobile) remains unauthorized.
- **Chrome extension: token-free sign-in and Web Store listing — plan X1–X3 recorded, nothing
  implemented (branch `claude/chrome-extension-web-store-fb0101`, PR
  [#102](https://github.com/amitsharmaak/distil/pull/102), docs only, merged with `main` through
  `6da0e43`; checkpoint "Chrome extension: token-free sign-in and Web Store listing — plan
  X1–X3 — 2026-09-30"):** Amit wants
  the extension on the Chrome Web Store and wants users never to see a capture token: install,
  sign in, save. Design: per-browser connection tokens (new `kind`/`label` columns on
  `capture_tokens`, manual token kept for the Shortcut), a public `/extension/connect` page that
  mints a token and hands it to the pinned extension id through `externally_connectable` with a
  state nonce, "Connected browsers" in Settings, and "Sign in again" in the extension on
  rejection. Plan: **X1** server (migration, routes, connect page, returning-user `next`),
  **X2** extension 2.0 (sign-in flow, no token field, pinned `key`), **X3** store listing
  (packaging script, privacy page, listing text; Amit submits). Evidence checked on 2026-09-30:
  tokens are hash-only so the existing token cannot be reissued; returning-user sign-in always
  lands on `/`; Chromium's `externally_connectable` validator accepts `localhost` patterns. X1
  ends with a Production migration that needs Amit's authorization; X2 depends on X1 being
  deployed; X3 depends on X2 and on Amit's Web Store developer account. This plan supersedes
  the "share a zip of `browser-extension/`" step under Tester onboarding. Next: Amit answers
  the five decisions in the checkpoint and picks a phase (recommended X1).
- **One capture token per account (PR [#90](https://github.com/amitsharmaak/distil/pull/90),
  squash merged on 2026-09-30 at Amit's request after green CI; checkpoint "Single capture token —
  2026-09-30"):** Amit found named per-client tokens overkill; capture sources are not tracked per
  token. Settings → Capture now manages one token: generate, copy once, regenerate (which revokes
  every earlier token, legacy ones included). Storage is unchanged (hash only, no reveal). Locally
  verified (`npm run check`, `npm run test:integration`); the merge auto-deploys, but Production
  was not checked here. Production's two legacy tokens keep working until Amit first regenerates;
  he then pastes the new token into the extension and the iPhone Shortcut.
- **iPhone Shortcut without a visible token: plan only (branch
  `claude/iphone-shortcut-token-abstraction-e945a7`; checkpoint "iPhone Shortcut without a
  visible token: design and phased plan (D1–D3) — 2026-09-30"):** Amit wants the capture token
  abstracted away from Shortcut users. Recommended shape: one public token-free Shortcut that
  pairs itself with a short code shown in Settings → Capture and stores a phone-only `phone`
  token; it reuses the `kind`/`label` columns and kind-scoped `replaceActive` that the Chrome
  plan X1 introduces, and supersedes X1's "manual token stays for the Shortcut" once D3 ships.
  Three phases: D1 data and API, D2 Settings card, D3 Shortcut and runbook. No code changed.
  Next: Amit answers the five lettered decisions in the checkpoint (including D1's order against
  X1) and picks D1 as its own task.
- **P8–P11 task-specific decisions and authorization (Amit, in chat, 2026-09-30; verbatim reply:
  `1A 2A 3B 4A`):** (1A) P8 uses the Neon HTTP driver for the proxy account lookup. (2A) P9 may
  trust the signed provider cookie cache for read-only navigations for up to 60 seconds; mutations,
  auth/account-sensitive paths, and missing/expired caches remain uncached. (3B) P11 stays on the
  Neon Free plan and accepts occasional cold wakes; no Neon setting, Vercel setting, or paid plan
  change is authorized. Read-only reconnaissance found `distil-production` fixed at 0.25 CU with
  mandatory scale-to-zero after five idle minutes, while Vercel Fluid Compute is already enabled.
  (4A) Codex may squash-merge each P8–P10 phase into `main` without asking again once its gates are
  green and its Preview reading meets the phase goal; each merge auto-deploys because the release
  pin is `unpinned`. This authorization is limited to this P8–P11 task.
- **Admin invitations from Settings: plan I1–I3 recorded, nothing implemented (branch
  `claude/distil-onboarding-docs-a2addc`, docs only; checkpoint "Admin invitations from Settings:
  phased plan (I1–I3) — 2026-09-30"):** onboarding a colleague on 2026-09-30 needed a Neon SQL
  lookup for the operator UUID, an inline `DATABASE_URL` for `npm run auth:invite`, and a
  hand-pasted link. Plan: **I1** admin allowlist + `/api/v1/admin/invitations` (issue, list,
  revoke) reusing `executeInvitationCommand`; **I2** Settings → Invitations tab (admin only,
  link shown once with Copy, list with revoke); **I3** capture diagnostics moved out of the
  Capture tab into an admin-only Troubleshooting tab (Amit finds it noisy; an environment gate
  would hide it where the failures live). The same branch adds `docs/onboarding.md`, the guide
  sent to new users. Decisions 1–4 answered on 2026-09-30, all recommended options (env allowlist, any
  email, audit when configured, admin-only Troubleshooting tab). Next: Amit starts I1–I3 as one
  task with the code prompt in the checkpoint.
- **Keyboard navigation: K1–K4 implemented, PR
  [#101](https://github.com/amitsharmaak/distil/pull/101) (branch `claude/keyboard-k1`, worktree
  `k1-prompt-455dd8`; checkpoints "Keyboard navigation K1–K4 … — 2026-09-30" and "Keyboard
  navigation: audit and phased plan (K1–K4) — 2026-09-30"):** Amit's decisions: `1A 2A 3A 4A 5A`
  (Gmail-style keys; on/off switch in localStorage; row markup fix inside K2; agent squash-merges
  after green gates and a local browser check; order K1 → K2 → K3 → K4). For this task 4A/5A
  (merge per phase, one phase per session) are superseded by "Amit, in chat, 2026-09-30: finish
  all four phases, then merge and deploy to Production together": all four phases sit on one
  branch in PR #101 and ship as one squash merge, which auto-deploys (release pin `unpinned`).
  Shipped: shortcut engine, `?` help dialog and single-key switch, `g`-navigation (K1); `j`/`k`/`o`
  row navigation on Feed and Today with the nested-button row markup fixed (K2); reader keys plus
  Mark unread (Shift+U) and Copy link (Shift+C) (K3); Research, report and Settings keys, a
  Settings shortcuts card, a keyboard-only e2e spec and `docs/user-guide.md` (K4). Verified locally:
  in-app browser on the local loop and keyboard e2e 12 passed. Full gate at `ddb3547`:
  `npm run check` 244 suites / 1,999 tests, 0 lint errors, 4 warnings; `npm run test:integration` 4
  suites / 12 tests; `npm run test:extension` 12 passed; `npm run build` compiled;
  `npm run test:e2e` ran `keyboard.spec.ts` 4/4 in desktop-chromium, mobile-chromium and
  mobile-webkit, while `smoke`, `save` and `phase2` failed (15) only because the e2e server inherits
  `.env.local` auth and feature variables, which reproduces on `origin/main` `eaec1d2` and does not
  apply in CI (no `.env.local`); stages ran separately because `check:full` stops at the first
  failing stage; e2e (anonymous env): 33 passed, 0 failed, 9 skipped (the DB-gated keyboard tests skip there). Not merged, not deployed. Next: squash-merge #101 once
  CI is green, which deploys; then a Production smoke check of `?`, `g f`, `j`/`k` and Shift+U.
- **Collections feature removed in code (branch `codex/remove-collections`, PR
  [#98](https://github.com/amitsharmaak/distil/pull/98); checkpoint "Collections feature removed
  (code only) — 2026-09-30"):** the pages, API routes, UI controls,
  feed filter/query plumbing, repository port/implementation, personalization events and
  read-item resurfacing exceptions are removed. The `collections` and `collection_items` tables,
  existing data, schema/migrations, and lifecycle export/deletion support are intentionally
  unchanged. Local deterministic gate and production build pass; this branch is not merged or
  deployed and made no database or cloud change. Next: review the PR. A future table drop requires
  Amit's explicit approval and a Production-data check first.
- **Feed header, Filters sheet redesign and Search page retired (PR
  [#75](https://github.com/amitsharmaak/distil/pull/75), squash merged on 2026-09-29; checkpoint "Feed header: compact
  search, filters moved into the sheet — 2026-09-29"):** Amit found the full-width search too
  long, the filter pills too prominent, the Filters sheet poorly designed, and the separate Search
  page redundant. The search is now a compact pill beside the Feed title. Every filter lives in a
  redesigned sheet: a side panel on desktop, a bottom sheet on phones. The top-bar search icon,
  the sidebar Search entry and the Search page UI are gone, and `/search?…` redirects to
  `/feed?…`. This covers the UI part of F7. Still open from F7: the `/api/items` `q` branch,
  `GET /api/v1/search` (no UI caller now) and the `FEATURE_SEARCH` flag. Checked by tests and in the
  local in-app browser with real items: phone and desktop layouts, the `/search` redirect, and
  the removed icon and sidebar entry. Not yet checked on Production.
- **App slowness P8–P11 released (PRs [#78](https://github.com/amitsharmaak/distil/pull/78),
  [#80](https://github.com/amitsharmaak/distil/pull/80) and
  [#87](https://github.com/amitsharmaak/distil/pull/87); checkpoints "Performance P8",
  "Performance P9", "Performance P10" and "Performance P11" below):** P8's Neon HTTP adapter
  removed the proxy lookup's per-request Postgres connection while retaining the same
  security-definer lookup and authorization semantics (`1d2831a`). P10 removed rare-route
  prefetches and made Feed filters optimistic (`02759a9`). P9 uses Neon Auth's signed cookie only
  for ordinary GET/HEAD page and RSC reads, enforces the approved 60-second lifetime even across
  pre-release 300-second cookies, and leaves every mutation, API, Account and lifecycle path on
  exactly one uncached provider check (`c4506c4`). All three releases passed their applicable
  Quick/Full/Vercel gates. P9 Production deployment `dpl_CfuuRwXgf6BzbMBc4qRfn1AK4Ca8` is Ready,
  serves `distilai.app`, and `/api/health` returns 200. Preview could not exercise P9 because the
  Preview environment intentionally has legacy auth rather than the Production Neon Auth
  configuration; Amit explicitly authorized the green-gate merge and immediate Production
  validation instead. Production loaded an authenticated Feed successfully. Same-method warm
  Feed filter URL commits measured 693, 630 and 747 ms; the browser-control overhead dominates
  these readings, so they do not isolate P9's expected 80–250 ms server-side saving. P11 retains
  Neon Free's mandatory five-minute suspend and Vercel Fluid Compute; no cloud setting or plan
  changed. After more than six idle minutes, a Production Feed-filter route committed in
  1,332 ms; that single route-commit sample meets P11's under-1.5-second target but is not a claim
  that the previously observed 6.7–8.5-second full-stream tail is eliminated. Next: merge the
  docs-only P11 closure; no performance implementation remains in this plan.
- **AI cost accounting corrected (PR [#69](https://github.com/amitsharmaak/distil/pull/69),
  squash merged as `d3ec32e` on 2026-09-29; checkpoints "Consolidation of open PRs (2) —
  2026-09-29" and "AI cost accounting: verified prices, thinking tokens, grounding fee —
  2026-09-29"):** Amit asked for accurate per-call costs. Two Gemini rates were 3–5× too low,
  Gemini thinking tokens were never counted, and grounded-search queries were not charged. All
  three are fixed in code; recorded costs rise from the merge onward (earlier rows stay
  under-counted). Next: open follow-ups are listed in the checkpoint.
- **Tester onboarding: extension origin prefilled (PR
  [#66](https://github.com/amitsharmaak/distil/pull/66), squash merged as `bd06a58` on 2026-09-29;
  checkpoint "Extension origin defaults to Production — 2026-09-29"):** Amit wants to let a trusted tester try the full flow. The browser
  extension Options page now prefills `https://distilai.app`, so a tester only pastes their own
  capture token. Capture tokens are bound to one user and must never be shared between accounts.
  Next: Amit issues the tester's invitation himself (Production mutation) and shares
  a zip of `browser-extension/` plus an iCloud Shortcut link with his token removed. The zip
  step is superseded by the X1–X3 extension plan (Web Store install, sign-in, no token); the
  invitation step by the I1–I3 admin-invitations plan.
- **Deep research readability R1–R3: done and deployed; R4 dropped (orchestrated by Claude
  from worktree `deep-research-readability-r1-r4-846d48`; plan PR
  [#62](https://github.com/amitsharmaak/distil/pull/62); checkpoints "Deep research R1: readable
  report page", "Deep research R2: grounded numbered citations", "Deep research R2 hotfix:
  synthesis fits the 60 s function" and "Deep research R3: adaptive, deeper report", all
  2026-09-30):** Amit found reports hard to consume (baseline local run `5a9cf55a`: 789 words,
  fixed four-heading template, 41 sources listed / 8 cited, one small-type card). **Decisions
  (Amit, 2026-09-30, task-specific):** order R1 → R2 → R3; storage in the existing
  `research_reports` text columns (no migration); 1,500–2,500 words with TL;DR and key
  takeaways; Claude may squash merge each phase after green gates and a local check; R2's
  grounded path by fixtures was acceptable; **R4 (research-notes drill-down) dropped
  permanently — do not re-propose it.** **Shipped (each deployed to Production, deployment
  success, `/api/health` 200):** R1 PR [#81](https://github.com/amitsharmaak/distil/pull/81)
  `8280fdc` (reading column, TL;DR, TOC, domain chips, collapsed cited/other sources); R2 PR
  [#83](https://github.com/amitsharmaak/distil/pull/83) `0592c27` (grounding sources, `[n]`
  citations, cited-only numbered source objects, superscript UI); R2 hotfix PR
  [#84](https://github.com/amitsharmaak/distil/pull/84) `eaed15c` (the Anthropic SDK retried a
  timed-out 50 s synthesis inside the 60 s function; one attempt per call, hard stage deadline,
  per-provider budgets, killed deliveries counted); R3 PR
  [#85](https://github.com/amitsharmaak/distil/pull/85) `5c879ea` (outline → one write per
  section → assembly, run state v3, stepper fixed). **Result vs baseline (local run `10b849b6`,
  same question, Gemini):** 1,951 words; TL;DR 51 words, 5 takeaways, 4 question-specific
  sections with a table, caveats; 25 sources, all grounded and all cited, no URLs in the text;
  slowest stage 28 s; checked at desktop, 375 px and dark mode. Search grounding turned out to
  work on the free-tier key, so grounded sources were verified live locally, not only by
  fixtures. **Production evidence:** run `8bb4d982` (R2) failed on the synthesis timeout that
  #84 fixed. Run `8b17dcaf` (R3, at Amit's request, 13:14–13:23 local) completed its stages,
  stepper and 19 grounded sources, but every section write was refused by the app's own daily
  AI cost cap (`AIQuotaExceededError` `AI_BUDGET` from `assertTenantAIBudget`; day's recorded
  spend ~$1.08), so the stored report is 474 words of TL;DR, takeaways and six placeholders.
  **Not yet verified:** Claude (Production) timings for outline/write, and a full-length R3
  report on Production. **Daily AI budget raised to $2 (Amit, 2026-09-30):** Claude replaced
  the Production `DISTIL_DAILY_AI_BUDGET` value with `2` through the Vercel CLI (previous value
  not read; the env pull that would have exposed all secrets was refused) and it took effect with
  the `448fd36` deployment (08:26Z, success, `/api/health` 200). **R3 verified on Production (2026-09-30, at
  Amit's request, through his Chrome):** run `4d1cbcb5` (baseline question) completed in 5.5
  min: 3,760 words, TL;DR 26 words, 6 question-specific sections with 2 tables, 23 sources all
  grounded and all cited (34 catalogued), no URLs in the text, no placeholders; section writes
  took 18–31 s each against the 45 s stage deadline, and no "Task timed out" in the logs. The
  page renders as locally (TOC rail with sub-headings, superscript citations). Note: length
  overshot the 1,500–2,500-word target (six sections at the top of the 250–450-word range plus
  tables). **Capped (Amit, 2026-09-30):** at most 4 sections and 2,500 words per report, PR
  [#100](https://github.com/amitsharmaak/distil/pull/100) `13e1632` (checkpoint "Deep research:
  cap reports at 4 sections and 2,500 words — 2026-09-30"); not yet seen on a live run.
  **Follow-up done (Amit, 2026-09-30):** a report whose every section is a placeholder is now
  marked failed instead of completed (checkpoint "Deep research: fail an unwritten report —
  2026-09-30").
- **Ask Distil removed (A1; PR [#76](https://github.com/amitsharmaak/distil/pull/76), squash merged on 2026-09-30;
  checkpoints "Ask Distil removed (A1) — 2026-09-30" and "Removing Ask Distil — 2026-09-29"):**
  Amit decided the library-wide `/ask` chat was feature bloat for a flow product (capture, distil,
  read, move on) and asked for the code to be deleted with no redirect. `/ask` and
  `POST /api/v1/answers` are gone, along with the grounded-answer pipeline, the `knowledge-answer`
  AI task, the `FEATURE_ANSWERS` flag, the answers eval, and the orphaned `chat-panel.tsx` and
  `src/lib/agent/rag.ts`. No schema change. `npm run check` and `audit:phase3-security` pass and
  `next build` succeeds without either route. Merged and deployed on Amit's authorization
  (2026-09-30). The `FEATURE_ANSWERS` Production variable was deleted from Vercel on 2026-09-30
  (Claude, at Amit's request in chat; no redeploy needed since nothing reads it).
- **Inline search, quick filters and AI life areas: F1–F7 complete and deployed (plan PR
  [#61](https://github.com/amitsharmaak/distil/pull/61); F1 [#63](https://github.com/amitsharmaak/distil/pull/63),
  F2 [#64](https://github.com/amitsharmaak/distil/pull/64), F3 [#67](https://github.com/amitsharmaak/distil/pull/67),
  F4 [#72](https://github.com/amitsharmaak/distil/pull/72), Feed header and Search page UI
  [#75](https://github.com/amitsharmaak/distil/pull/75); F5 [#79](https://github.com/amitsharmaak/distil/pull/79)
  squash merged as `0d7d34b`, F6 [#82](https://github.com/amitsharmaak/distil/pull/82) as `35c3009`, F7
  [#86](https://github.com/amitsharmaak/distil/pull/86) as `6901bc9`, all on 2026-09-30; checkpoints "Inline search F7:
  legacy search path retired — 2026-09-30", "Life areas F6: area backfill — 2026-09-30", "Inline
  search F5: filter bar on Today — 2026-09-30" and the plan "Inline search, quick filters and life
  areas — 2026-09-29"):** Amit wanted one search bar on Today and Feed instead of a Search page,
  one-tap quick filters, and every item sorted by AI into Personal, Work, Learning or Updates,
  fixable with one tap.
  - **Today has the filter bar (F5).** Same compact search pill and Filters sheet as Feed. With a
    query, quick filter or area, Today shows one "Unread matches" list and "Search everything →"
    (to `/feed` with the same parameters plus `read=true`, which on the Feed page means "Read
    included"); otherwise Today is unchanged. Checked locally at 1280 px and 375 px, light and dark.
  - **Every item has an area (F6).** Tenant job `items.area-backfill` with a real handler, started
    by `POST /api/v1/areas/backfill` (counts via `GET`). **Local:** 4 items → Work 1, Learning 1,
    Updates 2 (0 failed). **Production** (one run, authorized by Amit, 2026-09-30 06:56Z, 2
    chained batches in ~33 s): 23 classified, 0 skipped, 0 failed, 0 left unclassified; library
    now Personal 0 · Work 4 · Learning 11 · Updates 9 (one item was already classified at capture).
    Cost: 23 flash-lite calls (local run: ~$0.001 for 4). No corrections yet.
  - **One search surface (F7, rescoped after A1 removed Ask).** The Feed/Today header search on
    `GET /api/v1/feed` is the only search. Removed: the Search page (PR #75; `/search?…` redirects
    to `/feed?…`), `GET /api/v1/search`, the `/api/items` `q` branch (now 400 with a pointer),
    `FEATURE_SEARCH`, and, with Ask gone, the now-callerless `hybridSearch`, `searchPassages` /
    passage store, `repositories.passages` and the `ItemFilters.query` clause. Kept:
    `content_chunks`, chunking, grounding, all schema. Nothing stays "for Ask" because Ask no
    longer exists. The leftover `FEATURE_SEARCH` and `FEATURE_ANSWERS` variables (Production
    only) were deleted from Vercel project `project-evgf1` on 2026-09-30 by Claude through Amit's
    signed-in Chrome, at his request in chat. No redeploy was triggered; nothing reads them, and
    the next deploy drops them. The other `FEATURE_*` variables are unchanged.
  - **Classifier model follow-up (decision 12): still open.** Question to Amit: which exact
    provider model id is "the new TypeSafe model GeV"? No id was assumed. Once named: confirm it
    with `npm run audit:ai-models`, switch the `classify-area` task in `src/lib/ai/ai-config.ts`,
    and compare a small local sample against flash-lite per area.
  - **Minor open items:** the local e2e `phase2.spec.ts` reader step fails on a dev server
    without sign-in (CI's production-build e2e passes). Closed: the Area label truncation at
    375 px (checkpoint "Filters sheet: segment labels fit on phones — 2026-09-30") and the unused
    `src/lib/ai/embeddings.ts` (checkpoint "Unused embeddings module removed — 2026-09-30").
    **F5–F7 orchestration authorizations (Amit, in chat, 2026-09-30; task-specific, used and now
    spent):** merge each of F5, F6 and F7 once green and checked locally; one F6 Production
    backfill; F7 removes `GET /api/v1/search`; Amit removes the Vercel `FEATURE_SEARCH` variable
    himself (he later asked Claude to delete it and `FEATURE_ANSWERS`, done 2026-09-30); the model
    follow-up is excluded unless Amit names the model id.
- **Adaptive brief and detailed summaries: S1 and S2 released, Detailed on Claude in Production
  (PR [#60](https://github.com/amitsharmaak/distil/pull/60), squash merged as `195189b` on
  2026-09-29; key record PR [#70](https://github.com/amitsharmaak/distil/pull/70), squash merged
  as `b5a5ce8`; checkpoints "Anthropic key added to Production — 2026-09-29", "Adaptive summaries S2:
  detailed as a delta over the brief — 2026-09-29"; plan in "Adaptive summaries: brief, detailed
  delta and depth on demand — 2026-09-28"):** Amit wants the summary to fit each piece, the
  brief to stay a short overview, and the detailed view to add meaningful depth beyond the
  brief. S1 (content-aware brief) was squash merged as `ea420d4` (PR
  [#59](https://github.com/amitsharmaak/distil/pull/59)) on 2026-09-29 and deployed to
  Production after the `summary-structure` stage was applied there at 09:53:39Z (checkpoint
  "Release: PR #59 to Production — 2026-09-29"). S2 makes Detailed a delta over the stored
  brief: it shows the brief once, a "Going deeper" divider, then only what the brief left out,
  and it is rebuilt when the brief is regenerated. No schema change. Verified locally with
  `npm run check` and on the four local items (all four pass the new delta check; per-item
  verdicts in the S2 checkpoint), on the Gemini fallback because the local `ANTHROPIC_API_KEY`
  is rejected. **Production:** Vercel had no `ANTHROPIC_API_KEY` when S2 deployed, so Detailed
  ran on Gemini at first. Amit then added a new key (audit: `claude-sonnet-4-6` ok) and
  redeployed, and confirmed Detailed works. An authentication failure still does not fall back
  to Gemini; if the key is ever revoked, remove the variable (Detailed then uses Gemini). Open
  items: the local `.env.local` key is still the rejected one unless Amit replaced it;
  the audit's `claude-haiku-4-5` MISSING report is fixed by PR
  [#71](https://github.com/amitsharmaak/distil/pull/71) (`021ec07`). S3 (depth on demand) starts from
  `main` on Amit's decision.
- **Wispr Flow shared notes now capture (PR
  [#57](https://github.com/amitsharmaak/distil/pull/57), squash merged as `4824f76` on
  2026-09-24 after the full gate; checkpoints "Wispr Flow shared notes rejected by the durable
  worker — 2026-09-24" and "Release: PR #57 to Production — 2026-09-24"):** a
  `notes.wisprflow.ai/shared/<slug>` link was silently rejected by the durable worker because the
  page is an empty client-rendered shell. `src/lib/wispr.ts` reads the note from Wispr's public
  share API and renders its markdown to reader HTML. Open items for Amit: confirm the Production
  deployment and re-share the original link — its old receipt is `rejected` and cannot be
  retried, so re-saving is what creates a fresh capture.
- **Capture diagnostics in Settings (branch `claude/capture-failure-notifications`, not yet
  merged; checkpoint "Capture diagnostics in Settings — 2026-09-24"):** Settings → Capture now
  lists the captures that never produced an item, each with its reason and a Retry or Save again
  action, read from `capture_requests` via `GET /api/v1/captures?status=rejected,failed`. No
  migration and no notification bell — see the checkpoint for why both were avoided. Open item
  for Amit: the populated list was never exercised against a database, because this worktree's
  `.env.local` has no `DATABASE_URL`; the first look on Production is the real check.
- **AI model audit accepts Anthropic aliases (PR
  [#71](https://github.com/amitsharmaak/distil/pull/71), squash merged as `021ec07` on
  2026-09-29; checkpoint "AI model audit resolves Anthropic aliases — 2026-09-29"):** `npm run audit:ai-models`
  reported `claude-haiku-4-5` as missing because Anthropic's ListModels returns only the dated
  snapshot. The ids stay undated aliases; the script now resolves an unlisted id with GetModel.
  No runtime or cloud change. Nothing open.
- **Model selection: Gemini default, Anthropic optional (PR
  [#55](https://github.com/amitsharmaak/distil/pull/55), squash merged as `e7f0b34` and live
  on Production since 2026-09-22; checkpoints "Gemini-default model selection — 2026-09-22" and
  "Release: PR #55 to Production — 2026-09-22"):** every task in `src/lib/ai/ai-config.ts` now
  prefers Gemini except `summarize-complex` and `research-synthesize`, which prefer Claude
  Sonnet and fall back to Gemini when `ANTHROPIC_API_KEY` is absent. OpenAI is assigned to
  nothing. Open items for Amit: run `npm run audit:ai-models` with the Production keys (or
  confirm `claude-sonnet-4-6` is enabled on the Production Anthropic project), since the Claude
  ids were never checked live; optionally remove `OPENAI_API_KEY` from Vercel, which nothing on
  the default path reads any more; the first Production summary and research run after the
  release have not been observed yet.
- **Deep research on Vercel: Steps 1 and 2 merged and live (PR
  [#51](https://github.com/amitsharmaak/distil/pull/51), squash merged as `60a9438` on
  2026-09-21 after the full gate; Production deployed it before 08:43Z — see "Release: PR #51 to
  Production — 2026-09-21" and "Deep research on a queue worker and the search facade —
  2026-09-21" below):**
  deep research (restored in PR [#49](https://github.com/amitsharmaak/distil/pull/49), `dc875da`,
  live since 2026-09-21) could not finish on Vercel Hobby because one run was 6–10 sequential
  model calls inside a single 60 s `after()` invocation, and its "search" calls never reached
  Gemini's search-grounded path. This branch (Step 1) moves a run onto the Vercel Queue topic
  `research-runs`: `startResearch` publishes one message and the consumer
  `src/app/api/queue/research-runs/route.ts` runs one resumable stage per message (plan, one
  search per sub-question, gaps, one deepening question per gap, synthesize), persisting stage
  state and partial findings in `research_reports.progress`; a redelivered message resumes at the
  first unfinished stage. Locally the same consumer runs in-process under
  `DISTIL_CAPTURE_DISPATCH=inline`. (Step 2) adds `generateTextWithSearch` to the tenant router,
  backed by `generateTenantTextWithSearch` (tenant budget, deferred accounting, Gemini
  `GEMINI_SEARCH_MODEL` with retry) and used by the search and deepening stages; it degrades to
  plain `research-search` routing when Gemini is absent or refuses grounding for quota. Finding:
  the local `GEMINI_API_KEY` project is on the Gemini free tier, where every search-grounded call
  is refused (429 quota) and plain calls are capped at 20 requests per model per day, so real web
  grounding could not be exercised locally; one full run completed through all nine stages in
  57 s with 41 memory-recalled sources. Next steps: (1) Amit merges the PR (label `full-ci`) and,
  before the first Production run, confirms the `research-runs` queue topic exists in the Vercel
  project (Storage → Queues; the `experimentalTriggers` entry in `vercel.json` registers the
  consumer on deploy, exactly as `capture-requests` is registered); no environment variable is
  needed for the queue itself. (2) For grounded sources, the Production `GEMINI_API_KEY` must
  belong to a Google AI project with billing enabled (Google Search grounding is not on the free
  tier); otherwise research keeps working from model memory and logs
  `research_search_grounding_fallback`. (3) One signed-in run on Production, then record the
  outcome. **Both done on 2026-09-21 through Amit's Chrome (checkpoint "Production verification
  and the retry directive — 2026-09-21"):** the `research-runs` consumer appeared under
  Observability → Queues on the first message, and a signed-in run completed end to end in 13
  minutes with 43 sources; the Production Gemini key is also free-tier (every search logged the
  grounding fallback), and each transient Gemini 503 cost about five minutes because the platform
  redelivers a thrown callback on its own backoff. The follow-up that asks the queue for a 60 s
  redelivery explicitly is merged as PR [#53](https://github.com/amitsharmaak/distil/pull/53)
  (`ef579e6`, live on Production since 2026-09-22; checkpoint "Release: PR #53 to Production —
  2026-09-22"). Open decision for Amit: a billing-enabled Google AI project for real web
  grounding. No further step is pending on deep research.
- **Deep research restored (PR [#49](https://github.com/amitsharmaak/distil/pull/49), squash
  merged as `dc875da` and live on Production since 2026-09-21; see "Release: PR #49 to
  Production — 2026-09-21" below):** Amit asked for the deep
  research feature back. It was unlinked from navigation in `509fccc` (#16, UI simplification)
  and deleted as dead routes in `f295124` (#24, P4); the library, prompts, proactive scanner,
  tables and repositories were never removed. This branch restores the eight
  `/api/ai/research/**` routes, `/research` and `/research/[id]`, the reader's Deep Research
  dialog and the desktop sidebar link, and fixes the latent bugs found on the way (see the
  checkpoint "Deep research restored — 2026-09-21"). Decisions taken with Amit: restore plus bug
  fixes (real web grounding is the separate phase brief below the checkpoint); on mobile the
  four-tab bar stays and Research is reached from Settings → Account → Library. Next steps: open
  the PR to `main` with the `full-ci` label (auth surfaces changed), merge after the gates; Amit
  decides the release. **Status on 2026-09-21: works locally (third run completed in 77 s with a
  summary and 48 sources); expected to fail on Production as is. Superseded by the bullet above
  once its branch merges.** Two reasons: (1) a run is
  6–10 sequential model calls and the project is on Vercel Hobby, whose 60 s cap also bounds
  `after()`, so a 77 s run is killed mid-way and the stale guard marks it failed after 15 min —
  the UI does not hang, but no report arrives; (2) the search steps call the tenant router's
  plain `generateText`, which never reaches Gemini's search-grounded path, so sources come from
  model memory (true locally too). Ordered plan, each its own task: **Step 1** move the run onto
  a Vercel Queue consumer (`research-runs` topic, one resumable stage per message — plan, each
  search, gaps, synthesis — persisting to `research_reports.progress`, same pattern as
  `src/app/api/queue/capture-requests/route.ts`; this is the durable tenant-scoped job the
  authorization-matrix note asks for); **Step 2** tenant-scoped `generateTextWithSearch` for the
  search steps (phase brief under the checkpoint). Stopgap instead of Step 1: Vercel Pro raises
  the cap to 300 s, which fits most runs but keeps one long function with no retry. Steps 1
  and 2 are implemented on `claude/deep-research-vercel-ea8b82` (bullet above).
- **Performance overhaul complete: every phase P0–P7 merged and released (P5 as PR
  [#36](https://github.com/amitsharmaak/distil/pull/36), `715c06f`, 2026-09-18), and P7's
  `perf-indexes` stage applied to Production on 2026-09-18 (checkpoint "P7 migration applied to
  Production — 2026-09-18"):** the
  checkpoint "Performance analysis and phased plan — 2026-09-16" below records a verified analysis
  and eight PR-sized phases P0–P7. Amit picks one phase per task, in order, each on its own
  `claude/<task>` branch with a dated checkpoint. P0 (measurement baseline) merged as PR
  [#21](https://github.com/amitsharmaak/distil/pull/21) (`f1cb2ac`). P1 (one auth verification
  per request and a signed identity handoff) merged as PR
  [#22](https://github.com/amitsharmaak/distil/pull/22) (`f2e4155`) and is live on Production;
  see the checkpoints "Performance P1 released — 2026-09-17" (live numbers) and "Performance P1:
  one auth verification per request — 2026-09-17" (design and local before/after) below. Codex
  completed P4 on `codex/perf-bundle` (owns `src/components/**`, `src/app/layout.tsx`,
  `next.config.ts`, `tsconfig.json`, `public/**`, `src/lib/ai/**`, the legacy route deletions and
  the route counts in `docs/authorization-matrix.json`), based on `53edd84`; its checkpoint below
  records the target exception and release verification. P2 (one shared pool, one tenant
  transaction per request with the verification folded into one statement, summary projections
  and keyset neighbours) merged as PR [#26](https://github.com/amitsharmaak/distil/pull/26)
  (`a06d0d7`) and is live on Production; see the checkpoints "Performance P2: database
  round-trip diet — 2026-09-17" (design and local before/after), "PR review, merges and
  cleanup — 2026-09-17" (integration, gates, release) and "Performance P2 released —
  2026-09-17" (live Production numbers) below. P6 (AI cost and latency: per-capture brief
  summary, accounting off the critical path, answer cache, provider bounds) merged as PR
  [#30](https://github.com/amitsharmaak/distil/pull/30) (`637d923`) and is live on Production;
  see "Performance P6: AI cost and latency — 2026-09-17" (design and local evidence) and
  "Performance P6 released — 2026-09-17" (release, what is still unverified) below. P3
  (`codex/perf-client-network`, Codex) merged as PR
  [#32](https://github.com/amitsharmaak/distil/pull/32) (`b815e6d`) after its Quick and Full
  gates passed; Claude reviewed and merged it as integration owner at Amit's request; see
  "Performance P3: client payload and network — 2026-09-17" below. P7 (`claude/perf-indexes`)
  is implemented, locally verified and merged with `main` at `b815e6d` (code merged cleanly; only
  this file conflicted); see "Performance P7: indexes — 2026-09-17" below for the RLS planner
  finding that reduced it to one index plus the `content_hash` column; its `perf-indexes`
  migration was applied to Production on 2026-09-18 (checkpoint "P7 migration applied to
  Production — 2026-09-18"). P5 merged as PR [#36](https://github.com/amitsharmaak/distil/pull/36)
  and its live numbers are in "Performance P5 live numbers — 2026-09-18".
- **Owner:** Amit decides direction. Claude Code and Codex work from repository files only.
  The concurrent P2/P4 pair and the concurrent P3/P7 pair (Codex owned `src/components/**`,
  `src/app/**`, `src/lib/public-config.ts`, `next.config.ts`, `docs/authorization-matrix.json`,
  `tests/e2e/**`; Claude owned the PostgreSQL migration, schema, feed-query, scripts and
  harness/security test paths) are integrated by Claude as integration owner. No ownership split
  is in force once P7 merges.
- **Branch / worktree:** `main` at `6446972` (#39, P5 live numbers) on 2026-09-18, after
  `0c15e4b` (#38, P7 migration record), `022a41f` (#37, P5 release record), `715c06f` (squash
  merge of PR [#36](https://github.com/amitsharmaak/distil/pull/36), P5) and `1115133`
  (#35) and `1cc670e` (#34, the jsdom runtime fix) on 2026-09-17,
  after `16c4c31` (#33, P7), `b815e6d` (#32, P3), `58a4a9c` (#31), `637d923` (#30, P6),
  `eb557a7` (#29), `c85f336` (#28), `a06d0d7` (#26, P2), `0d5e689` (#27, local loop),
  `9f0caf6` (#25) and `f295124` (#24, P4). No PR is open.
  Every merged task branch and worktree is deleted; the main checkout
  (`/Users/amitsharma/Projects/distil`) is on `main`. The only remaining Claude worktree besides
  the one that wrote this checkpoint is `.claude/worktrees/jabra-evolve-mic-test-7167d1`
  (branch `claude/jabra-evolve-mic-test-7167d1`, clean, no commits beyond `22cd7aa`, unrelated
  to Distil work; left for Amit to remove). Task branches follow the parallel-session routine in
  `AGENTS.md` §7.1 (one session per branch, branch from `origin/main`, merge not rebase,
  `/start-task` and `/finish-task`).
  Production serves `6446972` (docs-only on top of release `715c06f`, P5) on `distilai.app`
  (Vercel Production deployment created 2026-09-18T11:49Z, status `success`, Quick gate green,
  `/api/health` 200, checked 2026-09-18); `715c06f` was deployment `6518568715`; before it
  `1cc670e` (jsdom fix, deployment `6508492409`); the
  P3 (`b815e6d`) and P7 (`16c4c31`, deployment `6506943120`) merges auto-deployed before it.
  The Production library holds one item, captured by Claude from Amit's session on 2026-09-17
  ("How to Do Great Work", `261ff287-d316-4db9-bc5d-0771b881f90c`); archive or keep it.
  Release pin `DISTIL_PHASE3_PRODUCTION_SHA` = `unpinned` since 2026-09-16 (iteration phase):
  every push to `main` auto-deploys to Production through Vercel's Git integration; the P4
  (`6498811802`), local-loop (`6499086682`) and P2 deployments all arrived that way. The legacy
  alias `distil-pv-1850.vercel.app` is not a project domain, so it does not follow automatic
  deployments and must be re-aliased explicitly (`npx vercel alias set <deployment>
distil-pv-1850.vercel.app`) whenever it should match `distilai.app`; it still points at the P1
  release `f2e4155` and was not re-aliased today. No manual deploy, migration or
  environment-variable change was made today.
- **Local iteration loop (merged 2026-09-17, PR
  [#27](https://github.com/amitsharmaak/distil/pull/27), `0d5e689`):** Amit captures articles
  into a laptop-only PostgreSQL (Docker, in-process capture worker, legacy password login) and
  ships fixes to Production in batches. Runbook `docs/runbooks/local-development.md`; checkpoint
  "Local development loop — 2026-09-17" below. Local data is independent of Production and is
  wiped with `npm run db:local:reset`.
- **Progress at this checkpoint (password login, 2026-09-11 to 2026-09-16, complete and
  deployed):**
  - Email/password sign-in added alongside magic links, no 2FA (PR #7, `7278326`): hosted Neon
    Auth credential provider behind Distil-gated routes `POST /api/auth/sign-in/password`,
    `/api/auth/password/request-reset`, `/api/auth/password/reset`, `/api/auth/password/change`;
    no local password storage; 12-character minimum; per-IP and per-account rate limits;
    anti-enumeration preserved; first password set through the provider's emailed reset link;
    account center can change the password (revokes other sessions) or request a setup link.
    ADR 0004.
  - Neon Auth "Sign-in with Email" enabled for the Production branch
    (`br-damp-wildflower-b3kw15cu`) via the console on 2026-09-16; other provider settings left
    as found.
  - Sign-in redirect bug fixed (PR #11, `ec9758a`): a successful password sign-in now performs a
    full navigation (`src/lib/browser-navigation.ts`) because the app shell's prefetches had
    cached the anonymous redirect to the sign-in page.
  - Dedicated `https://distilai.app/sign-in` page (PR #12, `847a068`); `/invite` is invitation
    acceptance only and forwards to `/sign-in` without a token; every login redirect targets
    `/sign-in`; anonymous pages render without the authenticated shell.
  - Releases: `7278326` (`dpl_37haDb3zFz1moUGpw7LS7JECyyBH`), `ec9758a`
    (`dpl_GYe6JtxFxX1NpydW6K7MmX2wrT6G`), `847a068` (`dpl_EP5sasTc2PWDzdgRRrGSmrHcZWRB`), each
    through the exact-SHA gate with both origins re-aliased.
  - Smoke evidence: Amit set a password through the emailed link and the sign-in route returned
    200 for his credentials (Vercel runtime logs, 2026-09-16) before the redirect fix; after the
    fix, both origins serve the release and route anonymous requests to `/sign-in`. Amit decided
    on 2026-09-16 not to change the password or run the remaining smoke now; landing on Today
    after password sign-in, the change-password form and the magic-link fallback on the final
    release are therefore unverified by a person and remain an optional check, not a blocker.
- **Integration (2026-09-16):** branch `claude/integrate-tiering-ui` combines the two open task
  branches on top of `main`: `claude/test-tiering` (PR
  [#15](https://github.com/amitsharmaak/distil/pull/15), Tier 0 `check:quick`, Tier 1 `check` as
  the only required CI check, Tier 2 nightly "Full gate", release pin may be `unpinned`) and
  `claude/ui-simplification` (PR [#8](https://github.com/amitsharmaak/distil/pull/8), simplified
  navigation, reader chrome, top bar, settings and feed toolbar). The only conflict was this
  file; the UI branch's own record is kept as the checkpoint "UI simplification — 2026-09-11"
  below. Merged to `main` through the integration PR and released to Production the same day
  (see the checkpoint "Tiering and UI simplification released; pin unpinned" below).
- **Decisions recorded here:** `AGENTS.md` describes architecture; `CLAUDE.md` holds only
  Claude-specific notes; progress is recorded only in this file. Task branches are named
  `<agent>/<task>` (`codex/...` or `claude/...`). Concurrent work requires separate worktrees and a
  written ownership split in this section.
- **Performance decisions (Amit, in chat, 2026-09-16):** (1) authentication keeps exactly one
  uncached provider check per request, so a revoked session is still rejected on the next request;
  the variant that trusts the signed session cookie for GETs is not pursued. (2) Delete the
  unlinked `/sources`, `/topics`, `/research` routes, the never-called AI modules
  (`src/lib/ai/tagger.ts`, `src/lib/agent/workflows/triage.ts`, `src/lib/agent/insight-detection.ts`,
  `runAgent` in `src/lib/agent/orchestrator.ts`, `src/lib/ai/client.ts`,
  `src/lib/ai/circuit-breaker.ts`), `src/lib/notifications.ts` and the unmounted
  `src/components/agent/agent-status-panel.tsx`. (3) Generate one budget-admitted flash-lite brief
  summary per capture in the queue worker, cached under a content hash; on-demand regeneration in
  the reader stays; nightly digests were not selected. (4) Execute all phases P0 → P7 in order, one
  phase per task. Defaults applied unless Amit says otherwise: no cross-tenant article cache; add
  `babel-plugin-react-compiler` at the end of P4; running the P7 index migration in Production is a
  separate approval.
- **Blockers / open items (all non-blocking):**
  - P4 reduced the shared first-load bundle from 169.3 to 132.8 KB gzip but did not reach the
    brief's under-120 KB target: 130.7 KB is Next.js/React/Turbopack framework code before the
    remaining Distil shell. The reader target is met at 155.0 KB gzip. This is a recorded P4
    deviation, not a reason to move framework code or touch P3/P5-owned paths.
  - The deferred bug backlog (`BUG-PWA-001/002`, `BUG-IOS-001/002`, `BUG-CONTENT-001`,
    `BUG-SEARCH-001`, `BUG-READER-001`) below remains open and unscheduled.
  - Known functional gap found during the performance analysis: the tenant job types
    `regenerate_intelligence_summary`, `digest_run` and `knowledge_backfill` are enqueued but no
    handler is registered (`src/lib/jobs/tenant-runtime.ts` completes them as "No tenant handler
    registered"), so the nightly digest cron in `vercel.json` is write-only. Amit chose not to add
    digest work now; either register handlers or stop enqueuing in a later task.
  - Resolved 2026-09-16: the concurrent docs branches `claude/pwa-reinstall-notes` (PR #18,
    `735ee4d`) and `claude/perf-plan` (PR #19, `22cd7aa`) both merged; both checkpoints kept.
  - Two files of the branch-workflow tooling could not be written by Claude Code because the
    auto-mode classifier refused them: the shared `.claude/settings.json` (permission allowlist,
    `worktree.baseRef`) and `.claude/skills/finish-task/SKILL.md`. Amit adds them by hand from
    the checkpoint "Branch workflow tooling — 2026-09-16" below.
- **Verification of the integration branch (locally verified 2026-09-16, full gate on the
  combined tree at `54e8263`):** `npm run lint` 0 errors / 10 baseline warnings, Prettier clean;
  `tsc --noEmit` clean; `npm test` 201 suites / 1446 tests passed; `npm run test:integration`
  (Docker PostgreSQL) 12 suites / 44 tests passed; `npm run test:e2e` 27 passed / 3 skipped
  across desktop-chromium, mobile-chromium and mobile-webkit; `npm run test:extension` 11
  passed; `npm run build` succeeded. Codex/Claude sessions are not shared, so this is the only
  record of that run.
- **Verification of the preceding releases (locally verified 2026-09-16 unless noted):** every PR
  (#7, #9, #10, #11, #12, #13) passed the full quality gate (static, unit/component/contract,
  security, PostgreSQL integration, coverage, web/mobile and extension E2E, production build) and
  the exact-head `main` run after each merge. Local: `npm test` 201 suites / 1440 tests,
  `tsc --noEmit`, lint (0 errors, 10 baseline warnings), Prettier. Production: health 200 with
  `cache-control: no-store` on both origins; `/sign-in`, `/invite`, `/reset-password` 200; the
  password routes answer 403 without an allowed Origin; anonymous `/feed` redirects to
  `/sign-in`. The local `.env.local` has no `DATABASE_URL`, so a local `npm run dev` runs the
  legacy SQLite path and is not representative of Production; Postgres integration tests need
  Docker or `DISTIL_TEST_POSTGRES_URL`.
- **Previously recorded external state (not re-checked today):** Production library
  holds the 2026-09-17 capture plus the 2026-09-19 Shortcut capture; one user and two capture
  tokens (browser extension and `iPhone Shortcut`, the latter created 2026-09-19); Neon Auth
  project `distil-preview-db` with the single existing user.
- **Optional password-login check (deferred by Amit on 2026-09-16):** sign in at
  `https://distilai.app/sign-in`, confirm the Today page loads, change the password once from
  `/account`, and confirm "Email me a magic link instead" still works. If the emailed reset link
  ever lands somewhere other than `/reset-password?token=...`, adjust the page first.
- **Operational note:** Amit added local, gitignored Claude Code permission rules on 2026-09-16 so
  Claude Code can merge green PRs, update the release pin, deploy and re-alias without a manual
  step. The exact-SHA gate and the task-specific authorization rule in `AGENTS.md` §9 are
  unchanged: releases still happen only when Amit asks.
- **Exact next steps:**
  1. **Amit: answer the five decisions in the "Chrome extension: token-free sign-in and Web Store
     listing — plan X1–X3" checkpoint and pick a phase (recommended X1)**, then start it with
     the single-session code prompt at the end of that checkpoint. Independently, start I1–I3
     with the prompt in the admin-invitations checkpoint.
  2. **Amit: fix the Production AI credential.** The first live capture (checkpoint "First
     live capture and the jsdom runtime fix — 2026-09-17") extracted and indexed correctly, but
     the P6 brief summary was skipped with `AIProviderError AI_AUTHENTICATION`: the Gemini API
     key in Vercel's Production environment is rejected by the provider. Replace
     `GEMINI_API_KEY` in Vercel (Production) with a valid key, redeploy (or push any commit), then
     open the reader for the existing item and request a brief summary; expect a summary and no
     `capture_summary_skipped` in the runtime logs. Claude does not read or write provider
     secrets. Until then every capture lands without a generated summary (extractive brief only)
     and on-demand summaries fail the same way.
  3. Done 2026-09-18: the P7 `perf-indexes` stage is applied to Production (checkpoint "P7
     migration applied to Production — 2026-09-18" below). `ai_summaries.content_hash` now exists
     there; wiring it into the summary cache key is P6's deferred item and a small follow-up.
  4. Amit: look at Today, Feed, the reader and Settings at phone width and desktop (the
     simplified shell and P3's same-origin client have now been exercised by Claude through the
     in-app browser but not seen by a person), and make one browser-extension capture (the
     in-app `/save` path is verified; the extension path is not). Done 2026-09-19: the iPhone
     Shortcut is re-pointed at the apex with a Production token and its capture verified
     (checkpoint "iPhone Shortcut re-pointed at Production — 2026-09-19" below). The 2026-09-19 extension capture of an X post
     reached the API but was rejected by the worker (checkpoint "X/Twitter captures rejected by
     the durable worker — 2026-09-19"); fixed and released as PR #42 on 2026-09-20 (checkpoint
     "Release: PR #42 to Production — 2026-09-20").
  5. Rely on the 02:30 UTC nightly Full gate; if the "Nightly full gate failed" issue opens,
     treat it as the first task of the next session.
  6. Performance overhaul: done, measured live (checkpoint "Performance P5 live numbers —
     2026-09-18"). The remaining performance work is not in the plan, each a separate
     decision: the RLS/ordering architecture question from P7 (ordered index scans cannot cross
     the security barrier; adding the two unused indexes anyway would be a one-file `0011`
     stage), the ~130 ms `proxy-auth-db` lookup (`distil_resolve_auth_identity`, a SECURITY
     DEFINER lookup on `auth_identities`, the largest fixed per-request cost), and the
     multi-second Vercel + Neon cold start on the first request of a session.
  7. Other engineering candidates, each as its own short-lived branch with a state update: the
     dead `notifications.ts` module and the unlinked `/topics`, `/sources`, `/research` routes are
     now deleted in phase P4 of the performance plan; small mobile-web fixes `BUG-PWA-001/002` and
     the Shortcut URL extraction `BUG-IOS-001` remain. Phase 4 mobile work starts only on an
     explicit decision.
