# Capture triage

One small structured AI call per capture that scores the page's priority and checks whether the
extracted text is the real article or a junk page (sign-in wall, paywall stub, cookie or consent
wall, error page, bot check, empty JavaScript shell). Code: `src/lib/ai/triage-capture.ts`
(task `triage-capture`, `gemini-3.5-flash-lite` by default) and the shared contract in
`src/lib/contracts/capture-triage.ts`.

## What it does

- Runs only for **generic article captures**, inside the tenant capture job, after extraction and
  **before the summary call**. Specialised extractors (video, podcast and similar) are not
  triaged.
- The prompt sees only the capture's own extracted text (an excerpt of at most 2,000 characters
  plus its total length), its URL and metadata, and the owner's preference summary. Calls go
  through the tenant AI router, so they count against the owner's AI budget and audit.
- It returns a kind (`content` or one of the junk kinds), a readable flag, a confidence, a
  0–100 priority score on the same scale as `prioritize`, and a one-sentence reason. The verdict is
  stored under `items.content_classification.triage`.
- The priority score feeds the item's AI priority (`>= 70` high, `>= 40` medium, otherwise low).
  The existing feedback "reprioritize" path still rewrites priority for up to 200 items; it now
  blends with the triage score instead of starting from the default.

## Fail-open policy

Triage never blocks a capture because of its own failure. A timeout (8 seconds, one attempt), a
provider error, a budget refusal or unusable model output leaves the capture to continue exactly
as it would without triage: the item is saved and summarised at its default priority.

## When a capture is rejected

A junk verdict rejects the capture only when **every** guard holds:

- the model says the kind is a junk kind and the page is not readable;
- confidence is at least **0.9** (`JUNK_REJECT_MIN_CONFIDENCE`);
- the readable text is shorter than **3,000 characters** (`JUNK_REJECT_MAX_READABLE_CHARS`);
- the capture has **no user notes**;
- the capture was **not sent as high priority**;
- it is **not a second save** of the same URL.

Paywall stubs are treated as junk only at that high confidence, so a page with a real opening is
kept.

How a rejection appears:

- The capture receipt ends in `rejected` with error code `CONTENT_JUNK` and a plain message
  ("This looked like a sign-in page, not an article. Save it again to keep it anyway."). No item
  or summary is created and no summary call is made.
- Admins see rejected captures in Settings → Troubleshooting, with a **Save anyway** action.
- Saving the same URL again keeps it: a second save skips the junk check.

## Switching to shadow or off

`FEATURE_CAPTURE_TRIAGE` controls the mode (`src/lib/phase2/feature-flags.ts`):

| Value           | Behaviour                                                           |
| --------------- | ------------------------------------------------------------------- |
| unset (default) | On: score, and reject when every guard holds.                       |
| `shadow`        | Score and record the verdict (`enforced: false`), but never reject. |
| `false`         | Off: no triage call; captures behave as before the feature.         |

Changing it in Production or Preview is a Vercel environment-variable change and needs Amit's
task-specific authorization (AGENTS.md §9). It takes effect on the next deployment. Locally, set
it in `.env.local` and restart `npm run dev:local`.

## Running the eval locally

`evals/triage-eval.ts` runs the real triage prompt over hand-written fixtures
(`evals/triage-fixtures.json`: junk pages for every junk kind and tricky real pages) and,
optionally, one tenant's saved articles from the **local** database. It calls the configured
model, so it needs `GEMINI_API_KEY` and costs a few cents at most.

```bash
# Fixtures only (no database)
npm run eval:triage -- --fixtures-only

# Fixtures plus the local owner's most recent articles
npm run eval:triage -- --user-id <DISTIL_LEGACY_USER_ID> --limit 200

# With hand labels for database items: {"<item id>": "junk" | "ok"}
npm run eval:triage -- --user-id <uuid> --labels /path/outside/repo/labels.json
```

- It refuses a `DATABASE_URL` whose host is not loopback and never writes to the database.
  `.env.local` fills only variables that are not already set, so a local URL passed on the command
  line wins.
- Database items count as `ok` unless the labels file says otherwise.
- The report prints ids, fixture names and titles only, never page text: guarded and raw-model
  confusion tables, the false-reject list, junk that slipped through, the kind distribution, a
  score histogram, the high/medium/low split, p50/p95 latency and the estimated cost.
- Exit code 1 means at least one `ok` page would have been rejected (or every call failed). The
  default mode stays `on` only while this eval shows zero false rejects; otherwise switch to
  `shadow` and tune the prompt.
