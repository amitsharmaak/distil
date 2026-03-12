# Security Audit Report

**Date:** 2026-03-11
**Scope:** Full codebase review before public GitHub sharing
**Status:** Open — no fixes applied yet

---

## Critical — Fix Before Sharing

### 1. No Authentication on API

- **Location:** All `/api/*` routes
- **Issue:** Anyone with network access can read, create, modify, or delete all data. No session, JWT, or API key protection on any endpoint.
- **Impact:** Complete data compromise by unauthorized users.
- **Recommendation:** Implement authentication middleware (session/JWT/API key). Apply to all state-changing routes at minimum.

### 2. Wildcard CORS (`*`)

- **Location:** All API routes (e.g., `src/app/api/items/route.ts:42-46`, `src/app/api/items/[id]/route.ts:20-24`)
- **Issue:** `Access-Control-Allow-Origin: *` allows any website to call the API. Combined with lack of auth, any site can manipulate user data.
- **Impact:** Cross-origin data theft and manipulation.
- **Recommendation:** Restrict CORS to deployment domain and `chrome-extension://` origin. Use environment-based configuration:
  ```typescript
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'];
  ```

### 3. Plaintext Password Comparison

- **Location:** `src/app/api/data/route.ts:26`
- **Issue:** Delete-all password compared with `!==` — vulnerable to timing attacks. Password not hashed.
- **Impact:** Password brute-forcing without computational cost; timing attack exploitation.
- **Recommendation:**
  - Use `crypto.timingSafeEqual(Buffer.from(body.password), Buffer.from(deletePassword))`
  - Hash password at rest with bcrypt/argon2
  - Add rate limiting and exponential backoff on failed attempts

### 4. XSS via `dangerouslySetInnerHTML`

- **Location:** `src/components/feed/ai-summary.tsx:337`
- **Issue:** AI/email content rendered as raw HTML without sanitization. The `formatRawContent()` function (lines 30-64) converts user-supplied content to HTML but is not a comprehensive sanitizer.
- **Impact:** Stored XSS — a malicious email or Slack message could execute JavaScript in the browser.
- **Recommendation:**
  - Add `DOMPurify` and sanitize before rendering: `dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(processedContent) }}`
  - Or replace with `react-markdown` for safe rendering

---

## High — Fix Soon

### 5. SSRF in Open Graph Fetcher

- **Location:** `src/lib/og.ts:199`
- **Issue:** Fetches arbitrary user-provided URLs with no validation of protocol or IP range. No protection against:
  - Private IP ranges (127.0.0.1, 10.x.x.x, 172.16-31.x.x, 192.168.x.x)
  - Cloud metadata endpoints (169.254.169.254)
  - `file://` protocol
- **Impact:** Attackers can probe internal services or extract cloud credentials via saved URLs.
- **Recommendation:**
  - Whitelist protocols (http/https only)
  - Block private/reserved IP ranges before fetching
  - Consider using a library like `ssrf-req-filter`

### 6. OAuth Tokens Stored in Plaintext

- **Location:** `src/lib/db.ts:137-144` (oauth_tokens table), `src/lib/connectors/gmail.ts`
- **Issue:** Access and refresh tokens stored unencrypted in SQLite. SQLite has no encryption at rest.
- **Impact:** If the database file is accessed (backup, theft, misconfiguration), all connected accounts are compromised.
- **Recommendation:**
  - Encrypt tokens before storage using Node.js `crypto` or `libsodium`
  - Store encryption key in environment variable

### 7. Error Messages Leak Internals

- **Location:** `src/app/api/ai/summarize/route.ts:43` and other AI endpoints
- **Issue:** Raw `error.message` from AI providers returned to clients. May expose API keys, model names, rate-limit details, or internal paths.
- **Impact:** Information disclosure aiding further attacks.
- **Recommendation:**
  - Log full errors server-side
  - Return generic error messages to clients: `{ error: "Failed to generate summary" }`

---

## Medium — Should Address

### 8. No Rate Limiting

- **Location:** All `/api/*` endpoints
- **Issue:** No rate limiting on any endpoint. Enables brute-force attacks, DoS, and AI API cost explosion.
- **Recommendation:** Implement per-IP rate limiting (e.g., `@upstash/ratelimit` or in-memory store). Suggested limits:
  - Read endpoints: 100 req/min
  - Write endpoints: 10 req/min
  - AI endpoints: 10 summaries/hour, 1 research/min

### 9. No Input Size Validation

- **Location:** `src/app/api/items/route.ts:128-250`
- **Issue:** No validation of request body size or individual field lengths. `fullContent`, `title`, `summary`, `topics` are unbounded.
- **Recommendation:**
  - Add Next.js body size limit: `{ api: { bodyParser: { sizeLimit: '1mb' } } }`
  - Validate field lengths (title: 500 chars, summary: 10K chars, etc.)

### 10. No CSRF Protection

- **Location:** All POST/PATCH/DELETE endpoints
- **Issue:** No CSRF tokens or Origin/Referer header validation on state-changing operations.
- **Recommendation:** Add Origin header validation middleware or implement double-submit cookie pattern.

### 11. Unbounded Chat Storage

- **Location:** `src/app/api/agent/chat/route.ts:40-62`
- **Issue:** No limit on conversation count or message count. Disk space can be exhausted.
- **Recommendation:** Limit conversations and messages per user. Auto-cleanup old conversations.

### 12. Missing Security Headers

- **Location:** `src/app/layout.tsx`, `next.config.ts`
- **Issue:** No `Content-Security-Policy` or `X-Frame-Options` headers.
- **Impact:** Broader XSS impact; clickjacking via iframe embedding.
- **Recommendation:** Add headers in `next.config.ts`:
  ```typescript
  headers: async () => [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline';" },
    ],
  }]
  ```

### 13. Feedback Reason Not Validated

- **Location:** `src/app/api/ai/feedback/route.ts:12-23`
- **Issue:** The `reason` field has no length limit. Could be used for XSS if displayed, or to bloat the database.
- **Recommendation:** Validate `reason.length <= 1000` and sanitize before storage.

### 14. Slack Token Not Validated Before Use

- **Location:** `src/lib/connectors/slack.ts:88`
- **Issue:** No format validation on token before creating WebClient. Errors may leak token format information.
- **Recommendation:** Validate token starts with `xoxb-` and test with `auth.test()` on startup.

---

## Low — Nice to Have

### 15. Hardcoded User Agent

- **Location:** `src/lib/og.ts:31-32`
- **Issue:** Static user agent string. Some sites may block or rate-limit.

### 16. Implicit Enum Validation on Sort

- **Location:** `src/lib/db.ts:650-662`
- **Issue:** Sort parameter validated by TypeScript but not at runtime. Could be bypassed if input comes from untyped source.
- **Recommendation:** Add explicit allowlist check: `if (!['recent', 'priority', 'ai_priority'].includes(sort))`

### 17. Verbose Logging

- **Location:** `src/app/api/items/route.ts:234-247`
- **Issue:** Logs include item IDs and URLs. Low risk locally, higher if logs are shipped externally.

---

## Secrets & Environment

### Current Status: SAFE

- `.env.local` is properly listed in `.gitignore` (line 9)
- `.env.example` contains only placeholder values — no real secrets
- No API keys, tokens, or passwords committed in current source code
- No certificate files, private keys, or credential files in the repo

### Historical Note

- Commit `7beb3d3` contained a hardcoded password `"***REMOVED***"` in `src/app/api/data/route.ts`
- Fixed in commit `f1fe56a` — moved to `DISTIL_DELETE_PASSWORD` env var
- Password remains in git history — rotate if used elsewhere

---

## Hardcoded Values to Make Configurable

### High Priority (Blocks Deployment)

| Value | Location | Current | Recommendation |
|-------|----------|---------|----------------|
| Extension API URL | `browser-extension/background.js:22`, `popup.js:20` | `http://localhost:3000/api/items` | Make configurable via extension settings or build-time injection |
| AI model names | `src/lib/ai/ai-config.ts:27-81` | gemini-3-flash, claude-sonnet-4, gpt-4o-mini, etc. | Add env vars: `DEFAULT_SUMMARIZE_MODEL`, `DEFAULT_COMPLEX_MODEL` |

### Medium Priority (Usability)

| Value | Location | Current | Recommendation |
|-------|----------|---------|----------------|
| Gmail sync window | `src/lib/connectors/gmail.ts:40-45` | 30 days | Add `GMAIL_SYNC_WINDOW_DAYS` env var |
| Slack sync window | `src/lib/connectors/slack.ts:100` | 30 days | Add `SLACK_SYNC_WINDOW_DAYS` env var |
| AI daily budget | `src/lib/ai/router.ts:52` | $5 | Already has `DISTIL_DAILY_AI_BUDGET` env var; move default to config.ts |
| Budget warning threshold | `src/lib/ai/router.ts:53` | 90% | Add `DISTIL_BUDGET_WARN_THRESHOLD` env var |
| Priority score thresholds | `src/lib/ai/prioritize.ts:31-34` | High >= 70, Medium >= 40 | Add env vars or store in user_settings |
| Summarization token limits | `src/lib/ai/summarize.ts:122-137` | 4000/2000/8000 tokens | Add to config |
| Research concurrency | `src/lib/ai/research.ts:93` | 3 concurrent | Add `RESEARCH_CONCURRENCY_LIMIT` env var |
| Research gap limit | `src/lib/ai/research.ts:158` | 2 gaps max | Add `RESEARCH_MAX_GAPS` env var |
| Gmail fetch page size | `src/lib/connectors/gmail.ts:169` | 100 results | Add `GMAIL_SYNC_PAGE_SIZE` env var |
| Slack message fetch limit | `src/lib/connectors/slack.ts:187` | 200 per channel | Add `SLACK_MESSAGE_FETCH_LIMIT` env var |

### Low Priority (Polish)

| Value | Location | Current | Recommendation |
|-------|----------|---------|----------------|
| Brand name "Distil" | sidebar.tsx:49, layout.tsx:19, settings/page.tsx:147 | Hardcoded | Create `SITE_NAME` config constant |
| Extension auto-close timeout | `browser-extension/popup.js:98` | 1200ms | Move to extension config |
| Extension recent items count | `browser-extension/popup.js:53` | 3 items | Move to extension config |
| Sidebar width | `src/components/layout/sidebar.tsx:37` | w-64 / w-16 | Consider CSS custom properties |
| Priority weight defaults | `src/lib/ai/prioritize.ts:22-26` | Recency: 0.7, Topic: 0.9, Source: 0.6 | Configurable via env or settings |
| Recency decay factor | `src/lib/ai/prioritize.ts:46` | 10 days | Add `PRIORITIZE_RECENCY_HALF_LIFE_DAYS` env var |

---

## Recommended Fix Priority

### Phase 1 — Immediate (before public sharing)

1. Add `DOMPurify` for XSS fix in `ai-summary.tsx`
2. Add SSRF protection to `og.ts` (protocol whitelist + private IP block)
3. Use `crypto.timingSafeEqual` for password comparison in `data/route.ts`
4. Restrict CORS to deployment domain
5. Make browser extension API URL configurable

### Phase 2 — Short-term (first week after sharing)

6. Add basic API authentication middleware
7. Add rate limiting on all endpoints
8. Add input validation and size limits
9. Add security headers (CSP, X-Frame-Options)
10. Make AI models configurable via environment variables

### Phase 3 — Ongoing

11. Encrypt OAuth tokens at rest
12. Add CSRF protection
13. Improve error handling (generic messages to clients)
14. Make sync windows and AI thresholds configurable
15. Add pre-commit hook to prevent `.env.local` commits
