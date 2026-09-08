# Save to Distil from iPhone

The **Save to Distil** Shortcut sends a shared link directly to the durable capture API. Create a dedicated capture token for the Shortcut so it can be revoked without affecting the browser extension.

## Before you start

1. Open Distil in Safari and sign in.
2. Open **Settings → Capture**.
3. Create a token named `iPhone Shortcut`.
4. Copy the token immediately. Distil only displays the full value once.

Treat the token like a password. Do not put it in screenshots, notes shared with other people, or a Shortcut published to the Gallery.

## Build the Shortcut

In Apple's Shortcuts app, create a shortcut named **Save to Distil**:

1. Open the shortcut details, enable **Show in Share Sheet**, and accept **Anything**. Current
   iOS versions can expose the same Chrome page as a file, article, rich-text, or URL
   representation; accepting Anything lets the Content Graph choose the URL representation while
   the explicit no-URL branch below still rejects unsupported shares safely.
2. Add **Get URLs from Shortcut Input**. Tap the **Shortcut Input** variable, set its type to
   **URL**, and keep the complete URL rather than a component such as host or path.
3. Add **Count**, configured as **Count Items in URLs**.
4. Add **Get Item from List**, select **First Item**. This extracts the first HTTP(S) URL when an
   app shares both a title and a link.
5. Add **If**, configured as **If Count is greater than 0**. In the Otherwise branch, show the
   notification `No web link found` and stop the shortcut. Counting avoids unreliable object-type
   inference in Shortcuts' `is anything` condition.
6. In the positive branch, add **Get Contents of URL** with:
   - URL: `https://YOUR-DISTIL-HOST/api/v1/captures`
   - Method: `POST`
   - Headers: `Authorization` = `Bearer YOUR_CAPTURE_TOKEN`
   - Request body: JSON
   - `url`: the first URL from step 4
   - `source`: `ios-shortcut`
7. After the first **End If**, add **Get Dictionary from Input**, using the first **If Result**. The
   successful path's result is the response from **Get Contents of URL**; the no-URL path stops
   before reaching this action.
8. Add **Get Dictionary Value** for the key `receipt`, then an **If** action checking whether that
   value exists. In this branch, show `Saved to Distil` and stop the shortcut. Both new (`202`) and
   duplicate (`200`) saves contain `receipt`.
9. In the Otherwise branch, add **Get Dictionary Value** for `error`, then another **Get Dictionary
   Value** for `code` within that error dictionary.
10. If `code` is `UNAUTHORIZED`, show `Distil authorization failed. Replace the Shortcut token.`
    Otherwise show `Distil could not save this link. Try again.`

Do not leave **View Content Graph**, **Quick Look**, or other diagnostic actions in the finished
Shortcut. They are useful for inspecting an app's Share Sheet payload but can consume, convert, or
pause the workflow during normal capture.

Shortcuts does not expose a stable HTTP-status field for **Get Contents of URL**, so the recipe
branches on Distil's JSON envelope instead. Disable any option that automatically opens a failed
response in another app. A transport failure can stop **Get Contents of URL** before a dictionary
exists; configure the action to continue when possible and use the final fallback notification for
that path.

The Shortcut should not open Distil on success. A successful response means the capture has been durably queued; extraction may finish moments later.

## Add Distil to the Home Screen

1. Open Distil's `/save` page in Safari.
2. Tap **Share**, then **Add to Home Screen**.
3. Confirm the name **Distil** and tap **Add**.

The installed app opens directly to the save screen and respects the iPhone safe areas. Distil does not register a service worker, so private feed responses are never cached for offline access.

## Real-device acceptance checklist

Run this checklist on an iPhone 14 Pro Max in portrait orientation. Use a separate, revocable token for the Shortcut.

- [ ] Chrome: share a normal article to **Save to Distil**; a saved notification appears and one receipt is created.
- [ ] Safari: share the same article; the Shortcut reports saved and Distil returns the existing capture without creating another item.
- [ ] Apple News: share an article; the first HTTP(S) URL is extracted from the shared input and saved.
- [ ] Share plain text containing a URL; the first HTTP(S) URL is saved.
- [ ] Share text with no URL; the Shortcut reports `No web link found` and sends no request.
- [ ] Revoke the iPhone token in **Settings → Capture**, then share again; the Shortcut reports authorization failure.
- [ ] Create a replacement token and update the Shortcut; capture succeeds again.
- [ ] Add `/save` to the Home Screen; the icon, standalone display, status bar, keyboard, and bottom safe area render correctly.
- [ ] Turn on Airplane Mode; the Shortcut reports failure without claiming the article was saved.

For the “two other apps” device check, this runbook uses Safari and Apple News because they exercise a browser share and an app-provided article share in addition to Chrome.
