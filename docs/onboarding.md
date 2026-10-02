# Welcome to Distil

Distil is a personal knowledge app. You save links from your desktop browser or iPhone, and
Distil extracts, summarizes and organizes them into a calm daily reading feed you can search and
ask questions of. Everything below takes about 15 minutes. Nothing is public and nothing is
shared between accounts.

Distil lives at **https://distilai.app**.

## 1. Accept your invitation and sign in

1. Open the invitation link you received from Amit. It expires 7 days after it was issued, and
   it only works for the email address it was sent to.
2. Enter that email address and tap **Email me a magic link**.
3. Open the email and follow the link. You are now signed in.

Next time, go to **https://distilai.app/sign-in** and request a magic link there. The
invitation link is single-use.

## 2. Create your capture token

Both capture clients (the browser extension and the iPhone Shortcut) authenticate with one
personal token.

1. In Distil, open **Settings → Capture**.
2. Choose **Generate token** and copy it straight away. Distil shows the full value only once.
3. Keep it somewhere private for the next two steps. Treat it like a password: do not put it in
   screenshots or shared notes.

If you ever lose it, choose **Regenerate…**. The old token stops working everywhere, so update
the extension and the Shortcut afterwards.

## 3. Install the browser extension (Chrome, Edge, Brave, Arc)

The extension is not on the Chrome Web Store yet, so it is installed from a folder.

1. Unzip the `browser-extension` folder Amit sent you and keep it somewhere permanent, such as
   `~/Distil/browser-extension`. Chrome loads the extension from that folder, so do not delete
   or move it later.
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Choose **Load unpacked** and select the `browser-extension` folder.
4. Open the extension's **Options** page (click the puzzle icon, then **Distil — Save to
   Distil**, then the three dots and **Options**).
5. Leave the origin as `https://distilai.app`, paste your capture token, and save. Approve the
   access prompt for `distilai.app` when it appears.

Then save a page in any of three ways:

- Click the Distil icon in the toolbar (pin it from the puzzle menu so it stays visible).
- Right-click anywhere on a page and choose **Save to Distil**.
- Press **Cmd+Shift+S** on Mac or **Alt+Shift+S** on Windows.

Saves are queued locally first, so a page still gets captured if you are offline. The popup
shows the status of recent saves.

## 4. Save from your iPhone with the Shortcut

Install the **Save to Distil** Shortcut from the iCloud link Amit sent you. When it asks for
your capture token during import, paste the token from step 2 (include nothing else, and no
spaces).

If the import did not ask for a token, add it yourself:

1. Open the Shortcuts app, long-press **Save to Distil**, tap **Edit**.
2. Expand the **Get Contents of URL** action with **Show More**.
3. Check the URL is `https://distilai.app/api/v1/captures`.
4. Set the `Authorization` header to `Bearer YOUR_TOKEN`. Keep the word `Bearer`, one space,
   then the token, with no trailing space.
5. Tap **Done**.

To use it, share any link from Safari, Chrome, Apple News, Mail or any other app and pick
**Save to Distil** in the share sheet. You will see **Saved to Distil** within a couple of
seconds. The Shortcut does not open Distil on success.

If you see **Distil authorization failed**, the token in the Shortcut is wrong or was
regenerated. Repeat the steps above with your current token.

## 5. Add Distil to your iPhone Home Screen

This installs Distil as a standalone app. Use Safari, because Chrome on iOS cannot install
web apps.

1. In Safari, open **https://distilai.app/sign-in** and sign in.
2. Go to **https://distilai.app**.
3. Tap the **Share** button, then **Add to Home Screen**.
4. Keep the name **Distil** and tap **Add**.
5. Open the new icon. If it shows the sign-in page, sign in once more. This is expected, as the
   installed app keeps its own session separate from Safari.

The installed app opens on Today, and Save is one tap away in the bottom navigation.

## Day to day

- Save anything that looks worth reading. Extraction and summaries finish a few moments after
  the save.
- Open **https://distilai.app** (or the Home Screen icon) each day for your prioritized feed.
- Use search and **Ask** to find and question what you have saved. Answers cite your own
  captures.
- Saving the same URL twice is fine. Distil returns the existing item instead of duplicating it.

## If something goes wrong

- **Magic link never arrives.** Check spam, and confirm you used the exact email address the
  invitation was sent to.
- **Extension says unauthorized.** Open its Options page and paste your current token again.
- **Shortcut spins and nothing happens.** Check the URL in **Get Contents of URL** is exactly
  `https://distilai.app/api/v1/captures`.
- Anything else: message Amit.
