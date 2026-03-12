# Distil — Your Intelligent Information Hub

Distil is an AI-native knowledge companion that transforms the relentless flow of information into focused, actionable insight. It connects to your digital life — email, messaging, the web — and applies intelligent summarization, preference learning, and deep research to cut through the noise. The result is a single, curated view of what's worth your attention, shaped by how you engage with it over time.

## Features

- **Unified feed** — articles, newsletters, Slack links, and saved pages in one place
- **AI summaries** — automatic content summarization powered by your choice of AI model
- **Smart prioritization** — heuristic + AI scoring that learns from your feedback
- **Deep research** — multi-step research with live web search and cited reports
- **Source connectors** — Gmail newsletters (OAuth), Slack channels (Bot Token), browser extension
- **Full-text search** — instant search across all saved content

## Tech Stack

- **Next.js 16** (App Router) with TypeScript
- **Tailwind CSS v4** + **shadcn/ui** for components
- **better-sqlite3** for local SQLite database
- **Google Gemini / OpenAI / Anthropic** for AI features
- **Chrome Extension** (Manifest V3)
- **Jest** + **React Testing Library** for tests

## Quick Start

**Requirements:** Node.js ≥ 18, npm ≥ 9

```bash
# 1. Clone and install
git clone https://github.com/your-username/distil.git
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
| `GMAIL_NEWSLETTER_SENDERS` | *(empty)* | Comma-separated newsletter sender emails |
| `GMAIL_SYNC_AFTER_DATE` | 30 days ago | Earliest date to sync emails (YYYY/MM/DD) |
| `DISTIL_DELETE_PASSWORD` | *(none)* | Password for the "Delete All Data" endpoint |
| `DISTIL_API_TOKEN` | *(none)* | Bearer token to protect all API endpoints |
| `DISTIL_ALLOWED_ORIGINS` | *(empty)* | Comma-separated allowed CORS origins |
| `LOG_LEVEL` | `info` | Log level: trace/debug/info/warn/error |

See `.env.example` for setup instructions for each variable.

## AI Models

Distil supports multiple AI providers. Configure at least one API key:

| Provider | Variables | Models Used |
| ----------- | ---------------------- | -------------------------------- |
| **Gemini** | `GEMINI_API_KEY` | gemini-2.5-flash (default) |
| **OpenAI** | `OPENAI_API_KEY` | gpt-4o, gpt-4o-mini |
| **Anthropic** | `ANTHROPIC_API_KEY` | claude-sonnet, claude-haiku |

The active model and routing preferences can be configured from the Settings page in the app.

## Connector Setup

### Gmail (newsletters)

1. Go to [Google Cloud Console](https://console.cloud.google.com) and create a project
2. Enable the **Gmail API** (APIs & Services → Library)
3. Configure an OAuth consent screen (External, scope: `gmail.readonly`)
4. Create **OAuth 2.0 Web Application** credentials
5. Add authorized redirect URI: `http://localhost:3000/api/auth/gmail/callback`
   (use your deployed URL in production)
6. Copy the Client ID and Secret into `.env.local`
7. Set `GMAIL_NEWSLETTER_SENDERS` to the email addresses you want to sync
8. In the app: Settings → Gmail → Connect

### Slack

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Under **OAuth & Permissions**, add Bot Token Scopes: `channels:history`, `channels:read`, `users:read`
3. Install the app to your workspace and copy the `xoxb-` Bot Token
4. Invite the bot to channels you want to monitor: `/invite @your-app-name`
5. Set `SLACK_BOT_TOKEN` and `SLACK_CHANNELS` in `.env.local`
6. In the app: Settings → Slack → Sync

## Browser Extension

The Chrome extension (`browser-extension/`) lets you save any page to Distil with one click.

1. Open `chrome://extensions` and enable **Developer Mode**
2. Click **Load unpacked** and select the `browser-extension/` folder
3. The extension connects to `http://localhost:3000` by default

> **Deploying to production?** Update `DISTIL_API_URL` in both `browser-extension/background.js` and `browser-extension/popup.js` to point to your deployed URL before loading the extension.

## Deployment

### Any Node.js host (Railway, Render, Fly.io, etc.)

1. Set environment variables in your hosting dashboard:
   - `DB_PATH` → path on a **persistent volume** (e.g. `/mnt/data/distil.db`)
     ⚠️ Without a persistent volume, the database is wiped on every deploy.
   - `NEXT_PUBLIC_API_BASE_URL` → your deployed URL (e.g. `https://distil.yourdomain.com`)
   - `GOOGLE_REDIRECT_URI` → `https://distil.yourdomain.com/api/auth/gmail/callback`
2. **Build command:** `npm run build`
3. **Start command:** `npm run start`
4. Update `DISTIL_API_URL` in the browser extension to your deployed URL

### Production security checklist

- [ ] Set `DISTIL_API_TOKEN` to a strong random secret (`openssl rand -hex 32`)
- [ ] Set `DISTIL_ALLOWED_ORIGINS` to your deployed domain
- [ ] Set `DISTIL_DELETE_PASSWORD` to protect the data-wipe endpoint
- [ ] Set `NEXT_PUBLIC_API_BASE_URL` to your deployed URL (no trailing slash)
- [ ] Set `GOOGLE_REDIRECT_URI` to match your deployed callback URL
- [ ] Mount a persistent volume and point `DB_PATH` to it

## Architecture

```
src/
├── app/           # Next.js App Router pages & API routes
│   ├── api/       # REST API (items, AI, auth, connectors)
│   ├── feed/      # Feed list + detail pages
│   ├── settings/  # Settings & connector management
│   ├── topics/    # Topic browser
│   └── sources/   # Source browser
├── components/    # UI organized by feature
│   ├── layout/    # Sidebar, topbar
│   ├── dashboard/ # Stats, priority feed, timeline
│   ├── feed/      # Content cards, filters, AI summary
│   └── ui/        # shadcn/ui primitives
└── lib/           # Core logic (server-only where noted)
    ├── ai/        # AI integration (summarize, prioritize, research)
    ├── connectors/# Gmail, Slack connectors
    ├── db.ts      # SQLite singleton + CRUD helpers
    ├── config.ts  # Centralized env var config
    └── types.ts   # Core TypeScript interfaces
```

### Data Flow

- **Server Components** (Dashboard, Feed detail): query the database directly via `db.ts`
- **Client Components** (Feed list, Topics, Sources): fetch from `/api/items`
- **Browser Extension**: POSTs to `/api/items`
- **Connectors**: Slack and Gmail sync via dedicated API routes

### Database

SQLite at `data/distil.db` (gitignored). Created automatically on first run. Tables: `items`, `ai_summaries`, `feedback`, `research_reports`, `user_settings`, `oauth_tokens`.

## License

[MIT](LICENSE)
