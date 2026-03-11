# Distil — Your Intelligent Information Hub

Distil is a web app that consolidates information from multiple sources into a single modern interface. Connect your Gmail, Slack, browser, or add links manually — an agentic AI backend retrieves, summarizes, deduplicates, and prioritizes your content.

## Features

- **Unified feed** — articles, newsletters, Slack links, and saved pages in one place
- **AI summaries** — automatic content summarization powered by Google Gemini
- **Smart prioritization** — heuristic + AI scoring learns from your feedback
- **Deep research** — multi-step research with live web search and cited reports
- **Source connectors** — Gmail newsletters (OAuth), Slack channels (Bot Token), browser extension
- **Full-text search** — instant search across all saved content
- **Notifications** — real-time alerts for new content and AI activity

## Tech Stack

- **Next.js 16** (App Router) with TypeScript
- **Tailwind CSS v4** + **shadcn/ui** for components
- **better-sqlite3** for local SQLite database
- **Google Gemini** for AI features
- **Chrome Extension** (Manifest V3)
- **Jest** + **React Testing Library** for tests

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy the example env file
cp .env.example .env.local
# Edit .env.local to add your API keys (see Environment Variables below)

# 3. Start the dev server
npm run dev
# → Opens at http://localhost:3000
# → SQLite database is created at data/distil.db on first run (starts empty)
```

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

Copy `.env.example` to `.env.local` and configure. The defaults work for local development with no connectors — add API keys to enable features.

| Variable | Default | Purpose |
| ---------------------------- | -------------------------------- | -------------------------------------------- |
| `DB_PATH` | `./data/distil.db` | Path to the SQLite database file |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3000` | Base URL for client-side API calls |
| `GOOGLE_CLIENT_ID` | *(none)* | Google OAuth client ID for Gmail connector |
| `GOOGLE_CLIENT_SECRET` | *(none)* | Google OAuth client secret |
| `GEMINI_API_KEY` | *(none)* | Google Gemini API key for AI features |
| `SLACK_BOT_TOKEN` | *(none)* | Slack Bot Token for channel sync |
| `SLACK_CHANNELS` | *(empty)* | Comma-separated Slack channel names |
| `GMAIL_NEWSLETTER_SENDERS` | *(empty)* | Comma-separated newsletter sender emails |
| `GMAIL_SYNC_AFTER_DATE` | 30 days ago | Earliest date to sync emails (YYYY/MM/DD) |
| `DISTIL_DELETE_PASSWORD` | *(none)* | Password for the "Delete All Data" endpoint |

See `.env.example` for detailed setup instructions for each variable.

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
    ├── ai/        # Gemini integration (summarize, prioritize, research)
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

## Browser Extension

The Chrome extension (`browser-extension/`) lets you save any page to Distil with one click.

1. Open `chrome://extensions` and enable Developer Mode
2. Click "Load unpacked" and select the `browser-extension/` folder
3. The extension connects to `http://localhost:3000` by default — update `DISTIL_API_URL` in `popup.js` and `background.js` if your server runs elsewhere

## Deployment

1. Set environment variables in your hosting dashboard:
   - `DB_PATH` → path on a **persistent volume** (e.g. `/mnt/data/distil.db`)
   - `NEXT_PUBLIC_API_BASE_URL` → your deployed URL
2. **Build:** `npm run build`
3. **Start:** `npm run start`
4. Update `DISTIL_API_URL` in the browser extension to point to the deployed URL

## License

Private project.
