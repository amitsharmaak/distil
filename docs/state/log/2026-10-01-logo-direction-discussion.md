---
topic: logo-direction
title: Logo directions proposed; visual exploration awaits design discussion
date: 2026-10-01
time: 08:15
status: planned
branch: codex/logo-direction
---

## What changed

The user requested a replacement logo, explicitly asking to discuss options, inspiration and
trade-offs before creating it. This checkpoint records that discussion; no logo was generated,
application asset changed or design direction accepted.

Reviewed the current brand at `5fe4369`: `public/logo.svg` is a cyan/violet outlined funnel on
navy, used at 28 px beside a lowercase serif wordmark in the sidebar. `public/logo.png` is a
separate, more intricate illustrated funnel asset. The interface uses Newsreader and Outfit,
warm neutral surfaces and blue accents. A replacement needs to suit the favicon, extension
toolbar, sidebar and home-screen icon as well as the full wordmark.

Proposed directions, all unapproved:

- A custom lowercase d, inspired by publishers' marks and carved letterforms; the leading
  recommendation for a simple, recognizable identity.
- Several strokes condensed into one, inspired by editing and extracting the central idea;
  more explicit about the product, but risks resembling a generic filter icon.
- A distinctive droplet suggesting essence, with a subtle letterform; a literal connection
  to the name, but risks water, wellness or beverage associations.
- A typography-led lowercase wordmark inspired by book design, with a matching monogram
  for small icons; warm and editorial, but reliant on excellent letterform detail.

Suggested starting palette: ink, warm white and the app's blue, with deep teal or muted
terracotta as optional alternatives. Judge shapes in monochrome before choosing color.
Prefer a readable silhouette over details that require an explanation. The identity should
support full reading and revisiting sources as well as summarization.

## Verification

- Read `AGENTS.md`, the state-log format and the latest entries for the open topics.
- Checked the main checkout status, HEAD and worktrees; created this isolated worktree from
  freshly fetched `origin/main` (`5fe4369`). Logo, sidebar and style files were unchanged from
  the inspected checkout (`aa63baa`).
- Inspected the existing SVG source, PNG, font configuration and theme tokens. Consulted the
  official Instapaper and Readwise Reader pages for category positioning.
- Documentation only; no application behavior changed. Validate with `npm run state:check`
  and a Prettier check on this entry before handoff.
- Production appearance, deployments and external CI were not verified for this discussion.

## External resources

None modified. Public product pages were consulted read-only.

## Next

- Continue the design discussion and obtain the user's preference; the proposed directions
  and palette are recommendations, not accepted decisions.
- After the discussion, create comparable concept options in monochrome and one accent color,
  showing both the symbol and wordmark at small application sizes.
- Refine the chosen direction into production SVG and required raster exports, then coordinate
  application and extension updates as a separate implementation step. No release is authorized.
