# Distil Browser Extension

A Chrome (Manifest V3) extension that saves any page to your Distil feed with a single click.

## Loading the Extension (Development)

1. Open `chrome://extensions` and enable **Developer Mode** (top-right toggle)
2. Click **Load unpacked** and select this `browser-extension/` folder
3. The extension connects to `http://localhost:3000` by default — make sure the Distil dev server is running

## Using the Extension

Click the Distil icon in the Chrome toolbar while on any page. The page URL, title, and your optional notes are sent to your local Distil instance. If the API is unreachable, the item is saved locally in `chrome.storage` and synced on the next successful connection.

## Deploying with a Production Distil Instance

The API URL is hardcoded for local development. Before loading the extension against a deployed Distil instance, update **two files**:

1. `background.js` line ~22: change `DISTIL_API_URL` to your deployed URL
2. `popup.js` line ~8: change `DISTIL_API_URL` to the same deployed URL

Example:
```js
const DISTIL_API_URL = "https://distil.yourdomain.com/api/items";
```

You will also need to update `manifest.json` to allow the new host:
```json
"host_permissions": ["https://distil.yourdomain.com/*"],
```

Then reload the unpacked extension in `chrome://extensions`.

## API Token (optional)

If you have set `DISTIL_API_TOKEN` on your Distil server (recommended for any networked deployment), add the same value to `background.js` and `popup.js` where the `Authorization` header is constructed. See the Distil README's production security checklist for details.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Chrome extension manifest (MV3) |
| `background.js` | Service worker — handles save requests, local queue, API communication |
| `popup.html` / `popup.js` / `popup.css` | Extension popup UI |
| `icons/` | Extension icons (16px, 48px, 128px) |
