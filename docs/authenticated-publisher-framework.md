# Plan: Generic "Authenticated Publisher" framework (The Ken first)

## Context

The user has a paid subscription to **The Ken** (paywalled, Google SSO). They want full article content in Distil, not just email teasers. Rather than build a Ken-shaped one-off, they want a **generic framework for any subscription publication** — so adding the next one (Stratechery, Platformer, FT, Information…) is roughly a config entry. They also want manual ingestion (browser extension, paste-a-link) to route Ken URLs through the *same* authenticated fetcher — not the generic public HTTP extractor that hits a paywall stub.

YourStory / RSS is **deferred** — out of scope for this plan.

## Approach

A registry of `PublisherDefinition`s drives:

1. **Authenticated fetching** via per-publisher persisted Playwright contexts (the user logs in once through Google SSO in a real browser window; cookies persist on disk).
2. **Multiple discovery paths** that feed a shared queue: Gmail digest, logged-in feed crawl, optional RSS.
3. **A content strategy hook** so every ingestion path (manual link, browser extension, Gmail discovery, future RSS) automatically uses the authenticated fetcher when the URL matches a registered publisher.

Adding the next publisher = a ~15-line `PublisherDefinition` file + one line in the registry. Zero new code paths, zero new routes, zero new UI.

---

## Architecture

```
                  ┌──────────────────────────────────────┐
                  │           ingestion paths            │
                  │  manual POST /api/items              │
                  │  browser extension                   │
                  │  Gmail connector                     │
                  │  publisher discovery (digest, crawl) │
                  └──────────────────┬───────────────────┘
                                     │ url
                                     ▼
                          processContent(raw)
                                     │
                                     ▼
                       Stage 3 — extractContent
                                     │
                          detectStrategy(url)
                                     │
                ┌────────────────────┼────────────────────┐
                ▼                    ▼                    ▼
       PublisherStrategy      ArticleStrategy       YouTube/Tweet
       (urlMatcher hits)      (default)             (existing)
                │
                ▼
       publisherFetcher.fetch(publisher, url)
                │
       ┌────────┴─────────┐
       │ ensureSession()  │  ── persisted Playwright context per publisher
       │ Playwright fetch │     stored in data/publisher-sessions/<id>/
       │ Readability      │
       └────────┬─────────┘
                │  ExtractedContentResult
                ▼
       returns to pipeline → analyze → enrich → feed item
```

The crucial hook: **`PublisherStrategy` is a content-strategy** ([src/lib/content-strategies/index.ts:6](src/lib/content-strategies/index.ts#L6)), so it runs for *any* URL that enters `processContent`, regardless of how it got there. That's how the user's question — "will manual ingestion go through the same flow?" — is satisfied: yes, by construction. Manual paste, browser-extension save, Gmail-discovered URL, scheduler-discovered URL — all converge on the same `processContent → detectStrategy` switch, and any URL matching `the-ken.com/story/...` is routed to `PublisherStrategy` instead of `ArticleStrategy`.

---

## Core abstraction

```ts
// src/lib/connectors/publishers/types.ts
export interface PublisherDefinition {
  id: string;                       // "the-ken"
  name: string;                     // "The Ken"
  homeUrl: string;                  // "https://the-ken.com"
  loginUrl: string;                 // page that initiates Google SSO

  /** How we know a session is still valid. */
  sessionProbe: {
    url: string;
    expectSelector?: string;
    expectNotSelector?: string;
  };

  /** Decides which URLs belong to this publisher (used by PublisherStrategy + discovery). */
  urlMatcher: (url: string) => boolean;

  /** Optional override for extraction. Default: page.content() → Readability. */
  extract?: (page: import("playwright").Page) => Promise<{
    title: string;
    html: string;
    author?: string;
  }>;

  /** Sources that surface new article URLs. */
  discovery: PublisherDiscoveryStrategy[];

  fetchConcurrency?: number;        // default 1
  minDelayMs?: number;              // default 2000
}

export type PublisherDiscoveryStrategy =
  | { kind: "gmail-sender"; senders: string[] }
  | { kind: "rss"; url: string }
  | { kind: "logged-in-feed"; path: string; linkSelector: string };
```

Adding a publisher: one file like

```ts
// src/lib/connectors/publishers/publishers/the-ken.ts
export const theKen: PublisherDefinition = {
  id: "the-ken",
  name: "The Ken",
  homeUrl: "https://the-ken.com",
  loginUrl: "https://the-ken.com/login",
  sessionProbe: {
    url: "https://the-ken.com/account",
    expectSelector: '[data-testid="account-email"]', // verify on first run
  },
  urlMatcher: (url) => /^https?:\/\/the-ken\.com\/story\//.test(url),
  discovery: [
    { kind: "gmail-sender", senders: ["newsletter@the-ken.com", "team@the-ken.com"] },
  ],
  fetchConcurrency: 1,
  minDelayMs: 2500,
};
```

…plus one line in `registry.ts`. That's the whole onboarding.

---

## Module layout

```
src/lib/connectors/publishers/
  types.ts                  // interfaces above
  registry.ts               // PUBLISHERS: PublisherDefinition[]; getById(); findByUrl()
  session.ts                // Playwright persisted-context manager keyed by publisher.id
  fetcher.ts                // fetchArticle(publisher, url) → ExtractedContentResult
  strategy.ts               // PublisherStrategy (implements ContentStrategy)
  queue.ts                  // publisher_queue table helpers
  worker.ts                 // syncPublisher(id), syncAllPublishers()
  index.ts                  // public API barrel
  discovery/
    gmail-sender.ts
    rss.ts
    logged-in-feed.ts
  publishers/
    the-ken.ts              // first concrete entry
```

---

## Key components

### `session.ts` — the only Google-SSO-touching code

We don't implement Google SSO; we let the user complete it themselves in a real browser window and persist whatever cookies the publisher sets afterwards.

- `ensureSession(publisher)` — opens the persisted context, navigates to `sessionProbe.url`, validates selectors. Throws `PublisherAuthRequired` if invalid.
- `runInteractiveLogin(publisher)` — launches **non-headless** Chromium pointed at `publisher.loginUrl`. The user completes Google SSO in the popup. We poll `sessionProbe` until success, then close. Cookies persist at `data/publisher-sessions/<id>/`.
- `getStatus(publisher)` — `"connected" | "expired" | "never"` + rough TTL.

This is what makes it generic across publishers: the same flow works for any site whose login eventually sets a session cookie — Google SSO, email/password, magic link, anything. The user is the one logging in.

### `strategy.ts` — the manual-ingestion hook

```ts
// src/lib/connectors/publishers/strategy.ts
export const PublisherStrategy: ContentStrategy = {
  async extract(url) {
    const publisher = registry.findByUrl(url);
    if (!publisher) throw new Error("no publisher matches");
    return fetcher.fetchArticle(publisher, url);   // returns ExtractedContentResult
  },
  // …other ContentStrategy methods delegate to ArticleStrategy where appropriate
};
```

Plug into [src/lib/content-strategies/index.ts:6](src/lib/content-strategies/index.ts#L6):

```ts
export function detectStrategy(url: string): ContentStrategy {
  if (registry.findByUrl(url)) return PublisherStrategy;   // <-- new, runs first
  if (/youtube\.com\/watch|youtu\.be\//.test(url)) return YouTubeStrategy;
  if (/^https?:\/\/(www\.)?(twitter|x)\.com/.test(url)) return TweetStrategy;
  return ArticleStrategy;
}
```

That single edit answers the user's question: any ingestion path that calls `processContent` — manual `/api/items` POST, browser extension, Gmail-discovered URL, future RSS — will route Ken URLs through the authenticated fetcher.

If `PublisherStrategy.extract` throws `PublisherAuthRequired`, the pipeline marks the item `processingStatus: "processing"` (so it's hidden from feed but retained for retry) and writes a notification "Reconnect The Ken". Next session-valid sync picks up the retry queue.

### `fetcher.ts`

1. `await ensureSession(publisher)` → fail fast on auth.
2. `page.goto(url, { waitUntil: "networkidle" })`.
3. If `publisher.extract`, call it; else `page.content()` → Readability.
4. Return `ExtractedContentResult` shaped like `ArticleStrategy` returns, so the pipeline doesn't care which strategy ran.
5. Per-publisher mutex enforces `fetchConcurrency` and `minDelayMs` jitter.

### `queue.ts` — one shared table

[src/lib/db.ts](src/lib/db.ts):

```sql
CREATE TABLE publisher_queue (
  publisher_id TEXT NOT NULL,
  url TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | fetched | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  PRIMARY KEY (publisher_id, url)
);
```

The queue is for *batch discovery* paths (Gmail digest, logged-in crawl). Manual ingestion bypasses the queue — it goes straight through `processContent → PublisherStrategy → fetchArticle`.

### `worker.ts`

```ts
async function syncPublisher(id: string): Promise<{ count: number }> {
  const publisher = registry.get(id);
  await ensureSession(publisher);            // throws PublisherAuthRequired

  for (const strat of publisher.discovery) {
    await runDiscovery(publisher, strat);    // each strategy enqueues URLs
  }

  const urls = nextPending(id, 50);
  for (const url of urls) {
    await delay(publisher.minDelayMs ?? 2000);
    try {
      await processContent(buildRawContent({ sourceType: "publisher", url, publication: publisher.name }));
      markFetched(id, url);
    } catch (err) {
      markFailed(id, url, String(err));
    }
  }
  return { count: urls.length };
}
```

Note that the worker just enqueues a `RawContent` and lets `processContent` do the work. The `PublisherStrategy` activates inside Stage 3, so the worker doesn't fetch directly — same path as manual ingestion. One code path, two entry points.

### Discovery strategies

- **`gmail-sender`** — when the Gmail connector processes a message whose `From` matches `senders[]`, call `extractUrlsForPublisher(message, publisher)` and enqueue every URL where `publisher.urlMatcher(url) === true`. The Gmail item itself remains a regular Gmail feed item.
- **`logged-in-feed`** — using the persisted session, navigate to `path`, scrape anchor hrefs matching `linkSelector`, enqueue.
- **`rss`** — fetch a publisher's free RSS feed, enqueue links matching `urlMatcher`. Useful where headlines are public but bodies are paywalled.

### UI — registry-driven

[src/app/sources/page.tsx](src/app/sources/page.tsx):

```tsx
{publishers.map((p) => <PublisherCard key={p.id} publisher={p} />)}
```

`PublisherCard` shows status (Connected / Expired / Not connected), a Connect / Reconnect button (`POST /api/publishers/[id]/login`), and Sync Now (`POST /api/publishers/[id]/sync`). One implementation, N publishers.

### Routes

- `GET /api/publishers` — registry + statuses (powers the Sources page).
- `POST /api/publishers/[id]/login` — start interactive login (opens non-headless Chromium server-side; only meaningful in local/dev where the server runs on the user's machine — explicitly noted).
- `GET /api/publishers/[id]/status`
- `POST /api/publishers/[id]/sync`

### Type / config additions

- [src/lib/types.ts](src/lib/types.ts): `SourceType` += `"publisher"`. Use existing `publication` field on `ContentItem` to identify which publisher (don't bake publisher ids into the enum — defeats the genericity).
- [src/lib/config.ts](src/lib/config.ts): `publisherSessionDir` (default `data/publisher-sessions/`); optional `PUBLISHERS_ENABLED` env var (comma-separated ids; empty = all registered).
- `.gitignore`: `data/publisher-sessions/`.
- `package.json`: add `playwright`. Document `npx playwright install chromium` in setup.

### Gmail integration touch-point

[src/lib/connectors/gmail.ts](src/lib/connectors/gmail.ts): after a Gmail message is built, call `runGmailSenderDiscovery(message)` which iterates publishers whose discovery includes a `gmail-sender` strategy and enqueues URLs. Keeps Ken-specific knowledge out of the Gmail connector.

### Scheduler

[src/lib/sync-scheduler.ts](src/lib/sync-scheduler.ts): one new branch that calls `syncAllPublishers()`, gated on at least one publisher with a valid session.

### Local-only constraint (worth flagging)

The Playwright interactive-login flow opens a real browser window on the machine where the Next.js server runs. That's fine for the current "local app on user's laptop" deployment. If/when Distil deploys to a cloud host, login moves to a different model (e.g., a desktop helper app, or a "paste your cookies" fallback). Out of scope here, but the framework supports it because session persistence is a single module that can be swapped.

### ToS / risk note

The framework only fetches content the user is themselves entitled to, using the user's own session, rate-limited per publisher. Worth a one-time disclosure on the Sources page when the user connects their first authenticated publisher.

---

## Files touched

**New**
- [src/lib/connectors/publishers/types.ts](src/lib/connectors/publishers/types.ts)
- [src/lib/connectors/publishers/registry.ts](src/lib/connectors/publishers/registry.ts)
- [src/lib/connectors/publishers/session.ts](src/lib/connectors/publishers/session.ts)
- [src/lib/connectors/publishers/fetcher.ts](src/lib/connectors/publishers/fetcher.ts)
- [src/lib/connectors/publishers/strategy.ts](src/lib/connectors/publishers/strategy.ts)
- [src/lib/connectors/publishers/queue.ts](src/lib/connectors/publishers/queue.ts)
- [src/lib/connectors/publishers/worker.ts](src/lib/connectors/publishers/worker.ts)
- [src/lib/connectors/publishers/index.ts](src/lib/connectors/publishers/index.ts)
- [src/lib/connectors/publishers/discovery/gmail-sender.ts](src/lib/connectors/publishers/discovery/gmail-sender.ts)
- [src/lib/connectors/publishers/discovery/rss.ts](src/lib/connectors/publishers/discovery/rss.ts)
- [src/lib/connectors/publishers/discovery/logged-in-feed.ts](src/lib/connectors/publishers/discovery/logged-in-feed.ts)
- [src/lib/connectors/publishers/publishers/the-ken.ts](src/lib/connectors/publishers/publishers/the-ken.ts)
- [src/components/sources/publisher-card.tsx](src/components/sources/publisher-card.tsx)
- [src/app/api/publishers/route.ts](src/app/api/publishers/route.ts)
- [src/app/api/publishers/[id]/login/route.ts](src/app/api/publishers/[id]/login/route.ts)
- [src/app/api/publishers/[id]/status/route.ts](src/app/api/publishers/[id]/status/route.ts)
- [src/app/api/publishers/[id]/sync/route.ts](src/app/api/publishers/[id]/sync/route.ts)

**Modified**
- [src/lib/types.ts](src/lib/types.ts) — `SourceType` += `"publisher"`.
- [src/lib/config.ts](src/lib/config.ts) — `publisherSessionDir` + enable list.
- [src/lib/db.ts](src/lib/db.ts) — `publisher_queue` table.
- [src/lib/content-strategies/index.ts](src/lib/content-strategies/index.ts) — register `PublisherStrategy` first in `detectStrategy`.
- [src/lib/connectors/gmail.ts](src/lib/connectors/gmail.ts) — emit messages to publisher discovery.
- [src/lib/sync-scheduler.ts](src/lib/sync-scheduler.ts) — `syncAllPublishers` branch.
- [src/app/sources/page.tsx](src/app/sources/page.tsx) — registry-driven publisher cards.
- [src/components/layout/sidebar.tsx](src/components/layout/sidebar.tsx) — icon mapping for `"publisher"` source type.
- `package.json`, `.env.example`, `.gitignore`, `CLAUDE.md`.

## Reused, not rebuilt

- `buildRawContent` + `processContent` — full intelligence pipeline ([src/lib/intelligence/pipeline.ts:263](src/lib/intelligence/pipeline.ts#L263)).
- `detectStrategy` content-strategy switch — single point of integration ([src/lib/content-strategies/index.ts:6](src/lib/content-strategies/index.ts#L6)).
- URL-normalised dedup inside the pipeline (so a Ken URL ingested manually + via Gmail discovery produces one item).
- `connectorLogger`, sync scheduler shape, OAuth Gmail loop.
- Readability extraction (the `PublisherStrategy` reuses it on the rendered HTML — only the *fetch* differs from `ArticleStrategy`, not the *parse*).

## Verification

1. **Manual ingestion goes through PublisherStrategy** (the user's specific question): with The Ken connected, paste a paywalled Ken URL via the "Quick Add" form on Sources → confirm the resulting feed item has full article body (not paywall stub) and `sourceType: "publisher"`.
2. **Browser-extension ingestion**: same test via the Chrome extension → same outcome.
3. **Auth flow**: with no session, click Connect on the Ken card → real Chromium window opens at the-ken.com/login → complete Google SSO → close → status flips to "Connected". Confirm `data/publisher-sessions/the-ken/` is populated.
4. **Gmail discovery**: trigger Gmail sync → recent Ken digest is processed → URLs enqueued in `publisher_queue` → run `POST /api/publishers/the-ken/sync` → feed shows full-body items.
5. **Dedup**: ingest the same Ken URL via manual paste *and* via Gmail discovery → exactly one feed item.
6. **Genericity test**: register a second `PublisherDefinition` (e.g., a stub pointing at a free site) → without writing any new framework code, its card appears, login works, sync works, manual paste of its URLs routes through `PublisherStrategy`.
7. **Session expiry**: invalidate cookies → next sync surfaces `PublisherAuthRequired` → card flips to "Reconnect" → manually-pasted Ken URLs land in `processing` status with retry pending.
8. **Politeness**: tail logs during a multi-article sync — requests serialised, jitter respected.
9. **Build/lint**: `npm run build` and `npm run lint` clean.
