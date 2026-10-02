# Chrome Web Store listing

Everything the Chrome Web Store developer dashboard asks for, ready to paste. The upload is
`dist/distil-extension-<version>.zip` from `npm run extension:pack`, which removes the manifest
`key` and the localhost origins (see `scripts/pack-extension.ts`). Visibility: **Unlisted**.

## Package

- Upload: `dist/distil-extension-2.0.0.zip`
- Item id (assigned at the first upload, 2026-10-02): `malhlcmmheemmdebmjpgliligpjlnama`. It is
  listed in `DISTIL_EXTENSION_IDS` in `src/lib/extension/constants.ts` after the development id.
  That change must be deployed before testers install, otherwise the connect page cannot reach
  the store build.

## Store listing tab

**Name** (from the manifest): Distil — Save to Distil

**Summary** (132 characters max, from the manifest description):

> Save any webpage to Distil with one click

**Description:**

> Distil turns the articles, posts and pages you save into a daily reading brief with concise
> summaries, organised by area of your life.
>
> This extension is the quickest way to save to Distil:
>
> • Click the toolbar button, press Cmd+Shift+S (Alt+Shift+S on Windows and Linux), or right-click a
> page, link or selection and choose "Save to Distil".
> • Selected text is saved as a note with the page.
> • Saves made while offline are queued and delivered automatically when you are back online.
> • Sign in once through distilai.app. No tokens to copy, and you can disconnect the browser from
> Distil's Settings at any time.
>
> Distil is invitation-only. You need a Distil account to use this extension.

**Category:** Productivity (Tools is the alternative if Productivity is unavailable)

**Language:** English

**Graphic assets:**

- Store icon 128×128: `browser-extension/icons/icon128.png`
- Small promo tile 440×280: `browser-extension/store-assets/promo-small-440x280.png`
- Screenshots, 1280×800 (at least one, up to five). Capture in Chrome at a 1280×800 window:
  1. An article page with the extension popup open after "Saved to Distil".
  2. The Distil Feed with that item at the top, tagged Extension, with its summary.
  3. The connect page ("Connect this browser") during sign-in.
  4. Settings → Capture → Connected browsers listing "Chrome on macOS".

**Official URL:** none. **Homepage URL:** `https://distilai.app`. **Support URL:** optional, leave
empty or use the homepage.

## Privacy practices tab

**Single purpose:**

> Save the current page, a link or selected text to the user's Distil account so Distil can
> summarise and organise it.

**Permission justifications:**

| Permission                                            | Justification                                                                                                                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`                                           | Reads the URL and title of the current tab only when the user clicks the toolbar button or uses the keyboard shortcut to save it.                                    |
| `contextMenus`                                        | Adds the "Save to Distil" item to the right-click menu for pages, links and selected text.                                                                           |
| `storage`                                             | Keeps the user's Distil sign-in token, the connected browser's name and the queue of saves waiting to be delivered, on the device only.                              |
| `alarms`                                              | Retries queued saves periodically after a network failure, so saves made offline are delivered without the user reopening the extension.                             |
| Host permission `https://distilai.app/*`              | Sends each save to the user's Distil account and receives the sign-in handoff from the Distil website.                                                               |
| Optional host permissions `http://*/*`, `https://*/*` | Not granted at install. Requested at runtime only for the single server address a user enters under Options → Advanced (a self-hosted Distil), and only that origin. |

**Remote code:** No, I am not using remote code. All JavaScript is in the package.

**Data usage** (tick these):

- Website content: yes (page title and selected text of pages the user saves).
- Web history: yes (the URLs of pages the user chooses to save). Leave every other category
  unticked. The extension does not collect credentials: sign-in happens on distilai.app and the
  extension only stores the token Distil issues to it.

**Certifications** (all three apply; tick them):

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** `https://distilai.app/privacy`

## Distribution tab

- Visibility: **Unlisted** (only people with the link can find and install it).
- Regions: all regions.

## Notes for the reviewer (optional field)

> Distil is invitation-only. The extension's toolbar popup offers "Sign in to Distil", which opens
> https://distilai.app/extension/connect; after sign-in the page hands the extension a token for
> that browser through externally_connectable. Without an account the extension shows the signed-out
> state and saves nothing.

If review asks for test credentials, that means inviting the reviewer's address from Settings →
Invitations. That is a real invitation and Amit's decision; never share Amit's own account.
