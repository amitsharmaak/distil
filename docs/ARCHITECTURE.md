# Distil — Architecture Notes

This document explains non-obvious design decisions that aren't apparent from reading the code or CLAUDE.md. It's aimed at contributors who want to understand *why* things work the way they do.

---

## Ingestion: Fire-and-Forget (202 Accepted)

When `POST /api/items` receives a URL, it returns `202 Accepted` immediately and runs the intelligence pipeline in the background. The browser extension or Gmail connector gets a fast response, and enrichment (classification, extraction, summarization, embeddings) happens asynchronously.

This matters because the pipeline can take 3–10 seconds per item (network fetch + multiple AI calls). A synchronous response would time out browser extension requests and block Gmail syncs.

The exported `pendingIngestions` set in `src/app/api/items/route.ts` exists solely for tests — they can `await` all in-flight work before asserting database state.

---

## Deduplication by Normalized URL

Items are deduplicated using a *normalized* URL stored in the `normalized_url` column. Normalization strips tracking parameters (`utm_*`), sorts query params, and removes fragments, so `https://example.com/article?utm_source=email` and `https://example.com/article` resolve to the same item.

The dedup check is synchronous and runs before the background pipeline starts. The pipeline itself has a second dedup guard to handle the race condition when two requests for the same URL arrive within milliseconds of each other.

Implementation: `normalizeUrl()` in `src/lib/utils.ts`, used in `POST /api/items` and `processContent()`.

---

## processingStatus vs isRead

These are independent states that serve different purposes:

- `processingStatus` — lifecycle of the *pipeline*: `processing → ready | rejected`. Only `ready` items appear in the feed.
- `isRead` — user's reading state. A `ready` item starts unread; the user marks it read.

An item can be `processing` and unread, `ready` and read, or `rejected` (never shown to user). They are not related.

---

## Intelligence Pipeline Stages

Every piece of content flows through five stages in `src/lib/intelligence/pipeline.ts`:

```
RawContent → [1 Classify] → [2 Relevance Gate] → [3 Extract] → [4 Analyze] → [5 Enrich] → DB
```

1. **Classify** (`classifier.ts`) — AI assigns content type and, for emails, an `emailCategory` (newsletter, digest, personal, transactional, etc.). Falls back to heuristic signals if the AI response is malformed.

2. **Relevance gate** (`relevance.ts`) — Non-email sources always pass. For Gmail, the item must belong to an allowed email category (configured in Settings → Email Intelligence). If the AI classifier omits `emailCategory`, the gate falls back to Gmail header heuristics (`List-Unsubscribe`, `List-Id`, `Precedence: bulk`, etc.) before rejecting.

3. **Extract** (`extractor.ts`) — Pulls clean content. Priority order:
   - Authenticated publisher (Playwright + persisted session) — only for URLs matching a registered publisher
   - Readability + OG metadata — for all other URLs
   - Email body stripping — for Gmail items with no URL

4. **Analyze** (`analyzer.ts`) — Detects embedded media, extracts named entities and outbound links, computes an information-density heuristic score.

5. **Enrich** (`enricher.ts`) — Generates a two-sentence AI summary, assigns topic tags via the AI tagger, and computes a final priority score combining the heuristic score with any learned user preferences.

---

## AI Router and Provider Fallback

`src/lib/ai/router.ts` selects a provider + model for each task type. The task → model mapping is in `src/lib/ai/ai-config.ts`.

Fallback logic: if the preferred provider for a task isn't available (API key not configured), the router picks the first available provider and uses its fallback model for that task. If no providers are configured, calls throw with a descriptive message.

The `AIUsageTracker` class tracks estimated cost in USD per calendar day (in-process, resets at midnight). It enforces `DISTIL_DAILY_AI_BUDGET` if set, and warns at 90% of budget. Cost estimates are based on character-count token approximations (4 chars ≈ 1 token) — they're directionally accurate but not billing-precise.

The router uses a `globalThis` singleton so the same instance (and its accumulated daily total) survives Next.js hot-module reloads in development.

---

## Agent Tool-Calling Loop

The agent orchestrator (`src/lib/agent/orchestrator.ts`) implements a simple ReAct-style loop:

```
Prompt LLM → Parse tool calls from response → Execute tools → Append results → Repeat
```

Tool calls are wrapped in markdown code fences (` ```tool_call ... ``` `) rather than a structured function-calling API because:
- It works uniformly across all three AI providers (Gemini, OpenAI, Anthropic) without provider-specific tool schemas
- The LLM can reason about whether to call a tool in the same text turn as the call itself

`MAX_ITERATIONS = 10` caps runaway loops. `MAX_TOOL_CALLS_PER_TURN = 3` limits parallel tool execution within a single LLM response.

---

## RAG Intent Classification

Before retrieving context, `ragQuery()` in `src/lib/agent/rag.ts` classifies the query into one of three intents using regex matching (not AI):

- **conversational** — greetings and social phrases; answered directly with no retrieval
- **general** — digest/summary/browse queries; retrieves the user's most recent unread items
- **specific** — everything else; uses hybrid semantic + FTS search to find relevant items

Regex-based classification is intentional: it's fast, free, and the patterns are narrow enough that false positives are rare. If a specific query accidentally matches as general, the worst outcome is a slightly less targeted answer.

Chunking splits content by double-newline (paragraph boundaries), targeting ~500 tokens per chunk (estimated as `chars / 4`). Citations use `[N]` notation where N maps to a source in the returned `citations` array.

---

## Authenticated Publisher Sessions

Publishers like The Ken use `Playwright` with a persisted browser context stored in `data/publisher-sessions/<id>/`. The user logs in once interactively (a real Chromium window opens so they can complete Google SSO), and subsequent fetches reuse the session.

**Local-only constraint**: This model only works when the Next.js server runs on the user's machine — the Playwright browser and session files live locally. Cloud deployments would need a different model (e.g. storing session cookies encrypted in the DB and using a remote browser service).

The `PublisherAuthRequired` error propagates from the extractor through the pipeline to the worker, where it surfaces as a "Reconnect" prompt in the Sources UI.

---

## CORS and Authentication

The API uses `Access-Control-Allow-Origin: *` intentionally — this is a personal, local-first app and the Chrome extension needs cross-origin access. **For any networked or cloud deployment**, set `DISTIL_API_TOKEN` (bearer token) and `DISTIL_ALLOWED_ORIGINS` (comma-separated origins) to lock it down. The production security checklist in the README covers this.

---

## Database: FTS5 Triggers

Full-text search uses SQLite FTS5. A shadow table (`items_fts`) is kept in sync with `items` via triggers that fire on insert, update, and delete. This is why you'll see `CREATE TRIGGER` statements next to the FTS table definition in `src/lib/db.ts` — they're not optional cleanup; they're the sync mechanism.

---

## Why SQLite

SQLite makes Distil a true local-first app — zero infrastructure to run, data stays on your machine, and the DB file is trivially backed up. WAL mode is enabled for concurrent reads (multiple browser tabs / the extension hitting the API simultaneously). The `better-sqlite3` driver is used throughout because its synchronous API is simpler than async alternatives and fast enough for this workload.
