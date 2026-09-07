# Distil Browser Extension

A Chrome Manifest V3 extension that sends pages to Distil's durable capture API.

## Load for development

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select `browser-extension/`.
3. Open the extension's **Options** page.
4. Enter the Distil origin (for local development, `http://localhost:3000`) and a dedicated capture token from Distil Settings.
5. Approve access to that origin.

The token is kept only in `chrome.storage.local`, is never rendered after it is saved, and is sent solely in the `Authorization` header to the configured origin. Pending captures are stored under an opaque SHA-256 namespace derived from the origin and capture token. Switching tokens never replays the previous account's queue; restore that original token to replay it, or explicitly discard it in Settings.

## Capture and replay behavior

Toolbar, context-menu, and keyboard captures are normalized and persisted before any network request. Duplicate pending URLs share one queue entry. The extension replays pending captures when the service worker starts, Chrome starts, the five-minute alarm fires, configuration changes, and after new saves.

Successful `200` and `202` responses remove the queue entry. `401` and `403` preserve all pending entries and pause replay until the token is updated. `400` and `422` are terminal for that entry. Rate limits, server errors, and network failures remain queued for retry.

## Files

| File            | Purpose                                                             |
| --------------- | ------------------------------------------------------------------- |
| `manifest.json` | Manifest V3 permissions, commands, worker, and options registration |
| `background.js` | Persist-first capture queue, API transport, and replay lifecycle    |
| `options.*`     | Origin permission and capture-token configuration                   |
| `popup.*`       | Capture status UI                                                   |
| `icons/`        | Extension icons                                                     |
