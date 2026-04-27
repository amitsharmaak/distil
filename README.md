# Distil — Intelligence at the Speed of Thought

> *The internet produces 2.5 quintillion bytes of data every day. You have 24 hours. Distil gives you back your time.*

Distil is an AI-native second brain that intercepts the chaos — emails, Slack threads, bookmarked articles, breaking discoveries — and transforms it into a single, laser-focused intelligence feed. It doesn't just organize your information. It **understands** it, prioritizes it, and evolves with you. The more you use it, the smarter it gets.

This is what it feels like when your tools finally work *for* you.

## What Distil Does

- **One feed to rule them all** — Gmail, Slack channels, browser saves, and web articles converge into a single, distilled stream
- **AI that actually reads for you** — every piece of content is automatically summarized the moment it arrives, across Gemini, GPT-4o, or Claude
- **A feed that learns your mind** — every like and dislike trains a preference model that quietly reshapes your priorities over time
- **Deep research on demand** — fire off a multi-step research query and receive a cited, web-grounded intelligence report in minutes
- **Unified ingestion, zero configuration** — every source runs through the same intelligence pipeline: classify, score relevance, extract, analyze, enrich. No per-source glue code
- **Connected to your digital life** — Gmail OAuth, Slack Bot, and a one-click Chrome extension bring your world in automatically
- **Instant recall** — full-text search across everything you've ever saved, instantly

## Built With

- **Next.js 16** (App Router) + TypeScript — blazing-fast, server-first architecture
- **Tailwind CSS v4** + **shadcn/ui** — precision UI, zero compromise
- **SQLite** (local, zero-config) — your data stays yours
- **Google Gemini · OpenAI · Anthropic** — swap AI brains on the fly
- **Chrome Extension** (Manifest V3) — save anything from the web in one click
- **Jest** + **React Testing Library** — production-grade test coverage

## Get Running in 60 Seconds

**Requirements:** Node.js ≥ 18, npm ≥ 9

```bash
# 1. Clone and install
git clone https://github.com/amitsharmaak/distil.git
cd distil
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local — at minimum set GEMINI_API_KEY (or another AI key)

# 3. Start the dev server
npm run dev
# → Opens at http://localhost:3000
# → SQLite database is created at data/distil.db on first run (starts empty)
```

That's it. The database is created automatically on first run. No migrations to run.

## Commands

| Command | Description |
| ----------------------- | ---------------------------------------- |
| `npm run dev` | Start dev server at localhost:3000 |
| `npm run build` | Production build (includes type checks) |
| `npm run start` | Start production server |
| `npm run lint` | ESLint + Prettier check |
| `npm run format` | Auto-format all files |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |

## Environment Variables

Copy `.env.example` to `.env.local` and configure. All features are optional — the app works without any API keys (no AI, no connectors).

| Variable | Default | Purpose |
| ----------------------------- | ----------------------------------- | --------------------------------------------- |
| `DB_PATH` | `./data/distil.db` | Path to the SQLite database file |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3000` | Base URL for client-side API calls |
| `GEMINI_API_KEY` | *(none)* | Google Gemini API key (default AI provider) |
| `OPENAI_API_KEY` | *(none)* | OpenAI API key (GPT-4o, GPT-4o-mini) |
| `ANTHROPIC_API_KEY` | *(none)* | Anthropic API key (Claude models) |
| `GOOGLE_CLIENT_ID` | *(none)* | Google OAuth client ID for Gmail connector |
| `GOOGLE_CLIENT_SECRET` | *(none)* | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3000/api/auth/...` | Must match your Google Cloud Console URI |
| `SLACK_BOT_TOKEN` | *(none)* | Slack Bot Token (`xoxb-...`) |
| `SLACK_CHANNELS` | *(empty)* | Comma-separated Slack channel names |
| `GMAIL_SYNC_AFTER_DATE` | 30 days ago | Earliest date to sync emails (YYYY/MM/DD) |
| `GMAIL_NEWSLETTER_SENDERS` | *(empty)* | Reserved; Gmail uses inbox scan + auto newsletter detection |
| `DISTIL_DELETE_PASSWORD` | *(none)* | Password for the "Delete All Data" endpoint |
| `DISTIL_API_TOKEN` | *(none)* | Bearer token to protect all API endpoints |
| `DISTIL_ALLOWED_ORIGINS` | *(empty)* | Comma-separated allowed CORS origins |
| `LOG_LEVEL` | `info` | Log level: trace/debug/info/warn/error |

See `.env.example` for setup instructions for each variable.

## AI Models — Choose Your Brain

Distil is model-agnostic. Plug in any provider and switch without touching code:

| Provider | Variables | Models Used |
| ----------- | ---------------------- | -------------------------------- |
| **Gemini** | `GEMINI_API_KEY` | gemini-2.5-flash (default) |
| **OpenAI** | `OPENAI_API_KEY` | gpt-4o, gpt-4o-mini |
| **Anthropic** | `ANTHROPIC_API_KEY` | claude-sonnet, claude-haiku |

Switch models and configure routing preferences live from the Settings page — no redeploy required.

## Connect Your World

### Gmail — Your Entire Inbox, Intelligently Filtered

Distil reads all of your emails — not just newsletters. Every message is passed through the unified intelligence pipeline: it's classified by category (newsletter, digest, announcement, transactional, personal, etc.), scored for relevance, and only the categories you care about make it into your feed. You control which categories pass through directly from the Settings UI — no env vars or redeployments needed.

**Setup:**

1. Go to [Google Cloud Console](https://console.cloud.google.com) and create a project
2. Enable the **Gmail API** (APIs & Services → Library)
3. Configure an OAuth consent screen (External, scope: `gmail.readonly`)
4. Create **OAuth 2.0 Web Application** credentials
5. Add authorized redirect URI: `http://localhost:3000/api/auth/gmail/callback`
   (use your deployed URL in production)
6. Copy the Client ID and Secret into `.env.local`
7. In the app: Settings → Gmail → Connect
8. Go to Settings → **Email Intelligence** to choose which email categories appear in your feed

### Slack — Every Link Your Team Shares, Captured

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Under **OAuth & Permissions**, add Bot Token Scopes: `channels:history`, `channels:read`, `users:read`
3. Install the app to your workspace and copy the `xoxb-` Bot Token
4. Invite the bot to channels you want to monitor: `/invite @your-app-name`
5. Set `SLACK_BOT_TOKEN` and `SLACK_CHANNELS` in `.env.local`
6. In the app: Settings → Slack → Sync

## Browser Extension — The Web, Captured Instantly

The Chrome extension (`browser-extension/`) sends any page to Distil with a single click. It's there before you forget it exists.

1. Open `chrome://extensions` and enable **Developer Mode**
2. Click **Load unpacked** and select the `browser-extension/` folder
3. The extension connects to `http://localhost:3000` by default

> **Deploying to production?** Update `DISTIL_API_URL` in both `browser-extension/background.js` and `browser-extension/popup.js` to point to your deployed URL before loading the extension.

## Deploy to Production

### Any Node.js host (Railway, Render, Fly.io, etc.)

1. Set environment variables in your hosting dashboard:
   - `DB_PATH` → path on a **persistent volume** (e.g. `/mnt/data/distil.db`)
     ⚠️ Without a persistent volume, the database is wiped on every deploy.
   - `NEXT_PUBLIC_API_BASE_URL` → your deployed URL (e.g. `https://distil.yourdomain.com`)
   - `GOOGLE_REDIRECT_URI` → `https://distil.yourdomain.com/api/auth/gmail/callback`
2. **Build command:** `npm run build`
3. **Start command:** `npm run start`
4. Update `DISTIL_API_URL` in the browser extension to your deployed URL

### Production security checklist — lock it down

- [ ] Set `DISTIL_API_TOKEN` to a strong random secret (`openssl rand -hex 32`)
- [ ] Set `DISTIL_ALLOWED_ORIGINS` to your deployed domain
- [ ] Set `DISTIL_DELETE_PASSWORD` to protect the data-wipe endpoint
- [ ] Set `NEXT_PUBLIC_API_BASE_URL` to your deployed URL (no trailing slash)
- [ ] Set `GOOGLE_REDIRECT_URI` to match your deployed callback URL
- [ ] Mount a persistent volume and point `DB_PATH` to it

## Architecture — How the Intelligence Works

```
src/
├── app/           # Next.js App Router — pages & API surface
│   ├── api/       # REST API (items, AI, auth, connectors, agent)
│   ├── feed/      # Feed list + immersive detail reader
│   ├── research/  # Deep research report viewer
│   ├── settings/  # Source management & AI configuration
│   ├── topics/    # Topic browser
│   └── sources/   # Source browser
├── components/    # UI by feature — no god components
│   ├── layout/    # Sidebar, topbar, theme
│   ├── dashboard/ # Stats, priority feed, activity timeline
│   ├── feed/      # Cards, filters, AI summary, reader view
│   ├── agent/     # Agentic chat & status panels
│   └── ui/        # shadcn/ui primitives
└── lib/           # The intelligence core (server-only)
    ├── ai/        # Summarize · prioritize · research · embeddings
    ├── intelligence/ # Unified pipeline: classify → gate → extract → analyze → enrich
    ├── agent/     # Autonomous agent orchestration & RAG
    ├── prompts/   # All prompt templates, organized by domain
    ├── connectors/# Gmail (all emails), Slack
    ├── middleware/ # Auth, rate-limiting, CORS, tracing
    └── db.ts      # SQLite singleton + CRUD
```

### Unified Intelligence Pipeline

Every piece of content — regardless of source — flows through the same five-stage pipeline before appearing in your feed:

| Stage | Module | What it does |
|-------|--------|--------------|
| **1 — Classify** | `intelligence/classifier.ts` | AI categorizes the content type and, for emails, assigns an `emailCategory` (newsletter, digest, personal, transactional, etc.) |
| **2 — Relevance gate** | `intelligence/relevance.ts` | Drops items that don't match your preferences. Email categories are checked against your allowlist (configured in Settings → Email Intelligence); all other sources pass through automatically |
| **3 — Extract** | `intelligence/extractor.ts` | Pulls clean readable content via Readability for URLs, or strips email chrome from raw message bodies |
| **4 — Analyze** | `intelligence/analyzer.ts` | Detects embedded media, extracts entities and links, and computes an information-density score |
| **5 — Enrich** | `intelligence/enricher.ts` | Generates a two-sentence AI summary, assigns topic tags, and computes a heuristic priority score |

Raw content is persisted before processing so nothing is lost, and deduplication by normalized URL runs before Stage 1.

### Data Flow

- **Server Components** (Dashboard, Feed detail) — query the DB directly, zero network round-trips
- **Client Components** (Feed list, Topics, Sources) — fetch from `/api/items`
- **Browser Extension** — POSTs directly to `/api/items`
- **Intelligence pipeline** — every item is classified, relevance-gated, extracted, analyzed, and enriched automatically on ingestion
- **Connectors** — Slack and Gmail sync via dedicated API routes, on demand or on a schedule

### Database

Zero-config SQLite at `data/distil.db` — created automatically on first run, no migrations. Tables: `items`, `raw_content` (pre-pipeline snapshots), `ai_summaries`, `feedback`, `research_reports`, `user_settings`, `oauth_tokens`.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, code conventions, and how to add new providers, connectors, and publishers.

For a deep dive into design decisions — fire-and-forget ingestion, deduplication strategy, agent tool-calling format, RAG intent classification, and more — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

[MIT](LICENSE) — build freely, ship boldly.
