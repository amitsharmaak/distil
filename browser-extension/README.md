# Distil Browser Extension

A Chrome Manifest V3 extension that sends pages to Distil's durable capture API.

## Load for development

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select `browser-extension/`. The manifest `key` pins the extension
   id to the development id in `src/lib/extension/constants.ts`.
3. Click the toolbar button and choose **Sign in to Distil**. The extension opens
   `/extension/connect` on its origin; after sign-in, **Connect this browser** hands the extension a
   token minted for this browser alone.
4. The origin defaults to `https://distilai.app`. For local development, set
   `http://localhost:3000` under Options → Advanced and approve access to it.

The token is kept only in `chrome.storage.local`, is never shown, and is sent solely in the
`Authorization` header to the configured origin. Each connection is listed in Distil Settings →
Capture → Connected browsers, where it can be disconnected. Pending captures are stored under an
opaque namespace derived from the origin and the connection, and a new connection adopts the old
queue only when it belongs to the same account.

The manual capture token in Settings is for scripts and legacy Shortcuts. The current iPhone
Shortcut uses [code pairing](../docs/iphone-shortcut.md), and this extension uses browser sign-in;
regenerating the manual token disconnects neither of them.

## Pack for the Chrome Web Store

`npm run extension:pack` writes `dist/distil-extension-<version>.zip`. The store build drops the
manifest `key` (the store assigns its own id) and the localhost origins; documentation and
`store-assets/` stay out of the zip. Listing text, permission justifications and the privacy
answers are in `STORE.md`; the promo tile is in `store-assets/`.

## Capture and replay behavior

Toolbar, context-menu, and keyboard captures are normalized and persisted before any network request. Duplicate pending URLs share one queue entry. The extension replays pending captures when the service worker starts, Chrome starts, the five-minute alarm fires, configuration changes, and after new saves.

Successful `200` and `202` responses remove the queue entry. `401` and `403` preserve all pending entries and pause replay until the browser signs in again. `400` and `422` are terminal for that entry. Rate limits, server errors, and network failures remain queued for retry.

## Files

| File            | Purpose                                                             |
| --------------- | ------------------------------------------------------------------- |
| `manifest.json` | Manifest V3 permissions, commands, worker, and options registration |
| `background.js` | Persist-first capture queue, API transport, and replay lifecycle    |
| `options.*`     | Origin permission and capture-token configuration                   |
| `popup.*`       | Capture status UI                                                   |
| `icons/`        | Extension icons                                                     |
