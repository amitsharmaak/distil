# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PIA (Personal Information Aggregator) is a web app that consolidates information from multiple sources (WhatsApp, Slack, Gmail, LinkedIn, Twitter, browser extension, manual links) into a single modern interface. An agentic backend will retrieve, summarize, deduplicate, and prioritize content.

**Current state:** Frontend shell with mock data. No backend or real source integrations yet.

## Tech Stack

- **Next.js 16** (App Router) with TypeScript
- **Tailwind CSS v4** + **shadcn/ui** for components
- **lucide-react** for icons
- **Chrome Extension** (Manifest V3) in `browser-extension/`

## Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build (also runs TypeScript checks)
npm run lint     # ESLint
```

## Architecture

### Web App (`src/`)

- `src/app/` — Next.js App Router pages (Dashboard, Feed, Topics, Sources, Settings)
- `src/components/` — Organized by feature: `layout/`, `dashboard/`, `feed/`, `topics/`, `sources/`, `ui/`
- `src/lib/types.ts` — Core TypeScript interfaces (`ContentItem`, `Topic`, `Source`, `AgentSettings`)
- `src/lib/mock-data.ts` — Mock data powering all pages (replace with real API calls later)
- `src/lib/utils.ts` — shadcn utility (cn function)

### Layout

All pages share a root layout with a collapsible sidebar (`components/layout/sidebar.tsx`) and top bar with search (`components/layout/topbar.tsx`). The sidebar drives navigation via `usePathname()`.

### Content Model

Everything revolves around `ContentItem` which has: source type, content type (article/video/podcast), topics array, priority level, and read state. Items are filterable by all these dimensions on the Feed page.

### Browser Extension (`browser-extension/`)

Standalone Chrome MV3 extension. Saves pages to `chrome.storage.local`. Not yet connected to the web app backend — will send to PIA API in a future phase.

## Iterative Build Approach

This project is built incrementally. Future phases (not yet implemented):
1. Local storage backend (SQLite or JSON file) + API routes
2. Source connectors added one at a time (Gmail first, then others)
3. AI agent integration (Claude API) for summarization and prioritization
4. Video/podcast transcription + summarization
5. Deep research agent

## Conventions

- shadcn/ui components live in `src/components/ui/` — add new ones via `npx shadcn@latest add <component>`
- Source icons and colors are mapped via `Record<SourceType, ...>` objects in components that need them
- Time formatting uses local `timeAgo()` helper functions (not yet extracted to a shared util)
- All pages are client components (`"use client"`) since they use React state for interactivity
