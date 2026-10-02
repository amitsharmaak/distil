# Save to Distil from iPhone

Install **Save to Distil**, pair it once with a short code, then share articles from your usual
apps. You never need to copy a capture token or edit the Shortcut's headers.

## 1. Install

1. Sign in at `https://distilai.app` in Safari and open **Settings → Capture → iPhone**.
2. Tap **Get the Shortcut**, then add **Save to Distil** in Apple's Shortcuts app.
3. Allow the Shortcut's requested access to Distil and its files when iOS asks.

Everyone installs the same public iCloud link. The shared Shortcut contains no account credential.
The install link is hidden until Amit publishes the Shortcut and configures it for the deployment;
there is no downloadable Shortcut bundled in this repository. The [appendix](#appendix-build-the-shortcut)
is the recipe for building it yourself.

## 2. Pair once

1. In **Settings → Capture → iPhone**, tap **Pair this iPhone**.
2. Run **Save to Distil** from Shortcuts, or share an article to it, and type the displayed
   eight-character code when asked.
3. Wait for **iPhone paired**. If you started by sharing an article, the same run then saves it.

The code lasts ten minutes and works once. Generating another code replaces the previous one. If
pairing fails, return to Settings, generate a fresh code and try again. Do not put pairing codes
in screenshots, messages or logs.

## 3. Share articles

In Chrome, Safari or another app, open **Share → Save to Distil**. **Saved to Distil** means the
link was accepted; extraction and summarization may finish moments later. Saving the same link
again returns the existing capture. The Shortcut stays in the sharing flow without opening
Distil, and subsequent shares do not ask for a code.

A share must include a web link. With no link, the Shortcut reports **No web link found**. A
network failure does not mean the article was saved; reconnect and share again.

## Disconnect or pair again

Open **Settings → Capture → iPhone** to see paired connections and their last use. Choose
**Disconnect** beside the connection to revoke it. The next share clears its stored credential and
shows:

> Distil disconnected this iPhone. Share again to pair.

Generate a new code in Settings, then share again and enter it. You do not need to edit or reinstall
the Shortcut. Disconnecting this connection leaves other phone connections, browser connections
and the manual capture token active. Regenerating the manual token also leaves paired connections
active.

The Shortcut stores its credential in your iCloud Drive folder, `Shortcuts/Distil/token.txt`.
iCloud Drive synchronizes files across your devices; with this fixed path, devices on the same
Apple Account can share one pairing. Disconnecting that pairing affects all devices using its
file. The connection is not bound to physical iPhone hardware. Keep the folder private; changing
the Distil account in Safari does not switch the Shortcut's pairing. This consequence follows from
[Apple's iCloud Drive sync behavior](https://support.apple.com/en-gb/guide/icloud/mm19ef899373/icloud).

To switch Distil accounts, disconnect the connection in the original account and share once to
clear the file. Then sign in to the new account, generate its pairing code and share again.

### Moving from the old Shortcut

Install the pairing version and complete one successful share before removing the old version.
An existing Shortcut with a pasted manual token keeps working until that token is revoked or
regenerated. After switching, regenerate the manual token if you want to retire the old credential;
update any scripts or other legacy clients that still use it. The signed-in browser extension and
new phone pairing are unaffected.

## Add Distil to the Home Screen

1. Open `https://distilai.app/sign-in` in Safari and sign in.
2. Go to `https://distilai.app/save`. The manifest's `start_url` is `/save`, so installing from
   there gives the cleanest result.
3. Tap **Share**, then **Add to Home Screen**.
4. Confirm the name **Distil** and tap **Add**.
5. Open the new icon. If it shows the sign-in page, sign in once more inside the installed app.
   This is expected: the installed app keeps its own cookie jar and does not share Safari's
   session.

The installed app opens directly to the save screen and respects the iPhone safe areas. Distil does
not register a service worker, so private feed responses are never cached for offline access.

### Reinstall after an origin change

An installed web app is pinned to the exact origin it was added from. An icon added from an
older Vercel origin keeps opening that origin, and Neon Auth trusts only `distilai.app` for
sign-in, so the old icon cannot be repaired in place:

1. Long-press the old Distil icon, tap **Remove App**, then **Delete App**.
2. Repeat the steps above from `https://distilai.app`.
3. If the new icon still opens the old site, clear Safari's data for `distilai.app` under
   **Settings → Safari → Advanced → Website Data**, then repeat from step 1 of the section above.

## Real-device acceptance — Amit

This checklist is a device handoff, not a record of completed testing. Build and sign the Shortcut,
share its public iCloud link, and set `NEXT_PUBLIC_IOS_SHORTCUT_URL` in Vercel before testing the
install link. Amit owns those device and environment steps.

- [ ] Install using **Get the Shortcut**; no token or account information is requested at install.
- [ ] First run with no shared input prompts for the code, reports **iPhone paired**, and exits
      without making a capture request. The connection appears in Settings after refresh.
- [ ] Chrome: share a normal article; **Saved to Distil** appears and one receipt is created.
- [ ] Safari: share the same article; it saves without a pairing prompt and returns the existing
      capture without creating another item.
- [ ] Apple News, where available, or another article app: share a link and confirm extraction.
- [ ] Share plain text containing a URL; the first HTTP(S) URL is saved.
- [ ] Share text with no URL; **No web link found** appears and no capture request is sent.
- [ ] With no stored credential, try an incorrect, expired or already-used code. Each reports
      pairing failure, saves no credential and creates no capture. A fresh code pairs successfully.
- [ ] Disconnect in Settings and share again; the exact disconnection message above appears and
      the file is removed. Share once more with a new code; pairing and capture succeed.
- [ ] Regenerate the manual token; the paired Shortcut and signed-in browser extension still save.
- [ ] Install the same link on a second phone with a different Apple Account and Distil account;
      pair it and confirm each account receives only its own captures.
- [ ] Confirm the permissions and file save/read/delete actions on the target iOS version. Verify
      shared-file behavior separately if using multiple devices on one Apple Account.
- [ ] Add `/save` to the Home Screen; icon, standalone display, status bar, keyboard and safe areas
      render correctly.
- [ ] Turn on Airplane Mode; the Shortcut never claims the article was saved. Reconnect and retry.

## Appendix: build the Shortcut

This recipe is for Amit to build the distributed Shortcut, or for users who prefer to build it.
Action labels and file-permission prompts can vary with iOS; verify the finished flow on the target
iPhone before publishing it. Apple's [API request guide](https://support.apple.com/en-euro/guide/shortcuts/apd58d46713f/ios)
explains **Get Contents of URL**, JSON request bodies and variables.

### A. Read the stored credential

1. Create **Save to Distil** in Shortcuts. Enable **Show in Share Sheet**, accept **Anything**, and
   allow the Shortcut to run with no input so it can pair when launched directly.
2. Initialize **Capture Token** to empty text. Add **Get File from Folder** (called **Get File** in
   some versions). Use the user's iCloud Drive
   **Shortcuts** folder and relative path `Distil/token.txt`. Turn **Error If Not Found** off and
   disable the document picker. The full path is `Shortcuts/Distil/token.txt`.
3. If a file was found, use **Get Text from Input** on that file and set a variable named
   **Capture Token** to its contents. Missing or empty content takes the pairing branch below.
   Keep all secret-bearing variables out of **Show Result**, **Quick Look**, notifications,
   clipboard actions and logs.

### B. Pair when the file is missing or empty

1. If **Capture Token** has no value, add **Ask for Input**, type **Text**, with the prompt
   `Enter the code shown in Distil → Settings → Capture`. Keep the answer only in a variable.
2. Add **Get Contents of URL**:
   - URL: `https://distilai.app/api/v1/shortcut-pairings/exchange`
   - Method: `POST`
   - Header: `Content-Type` = `application/json`
   - Request body: JSON, with `code` set to the Ask for Input result
   - Optional `deviceName`: a short connection label, such as `iPhone`; omit it for the default
3. This exchange does not require a Safari session or an Authorization header. Convert the result
   with **Get Dictionary from Input**, then **Get Dictionary Value** for `token`.
4. If `token` is missing or empty, show `Could not pair. Get a new code in Distil and try again.`
   and **Stop This Shortcut**. Do not display the response, echo the code, save a file or continue
   to capture. Wrong, expired and consumed codes all return `error.code = UNAUTHORIZED` without
   further detail. If rate-limited, wait before requesting another code and retrying.
5. If `token` exists, set **Capture Token** to it. Ensure the `Distil` folder exists under the
   user's **Shortcuts** folder, then use **Save File** to write its text to `Distil/token.txt`.
   Turn **Ask Where to Save** off and **Overwrite If File Exists** on. Use the same base folder
   and path as the read action. Store only the credential, not the whole JSON response or code.
6. After the save succeeds, show `iPhone paired`. If there is no **Shortcut Input**, stop here.
   If there is shared input, continue below. A later direct run with a stored credential and no
   input should also stop without a capture request.

The file is a credential in the user's iCloud Drive, not a hardware-bound or Keychain secret.
Never include it, a pairing code, or a literal token in the shared Shortcut. Do not share its
folder. Only the ordinary Production origin and action definitions belong in the public artifact.

### C. Extract the URL and save

1. Add **Get URLs from Shortcut Input**. Tap its output variable and explicitly set its type to
   **URL**. Preserve this conversion and the numeric count guard: generic object/value checks
   have behaved inconsistently with app-provided share content.
2. Add **Count**, configured as **Count Items in URLs**. Add **If Count is greater than 0**.
   Otherwise show `No web link found` and stop.
3. In the nonempty branch, keep HTTP(S) URLs only (use **Repeat with Each** plus **Get Component
   of URL → Scheme** if the source may include other schemes), then take **First Item** with
   **Get Item from List**. If none remain, show `No web link found` and stop. Keep this URL in
   its own variable; do not accidentally use an exchange-response or file variable.
4. Add **Get Contents of URL**:
   - URL: `https://distilai.app/api/v1/captures`
   - Method: `POST`
   - Headers: `Authorization` = `Bearer ` followed by the **Capture Token** variable;
     `Content-Type` = `application/json`
   - Request body: JSON, `url` = the selected HTTP(S) URL, `source` = `ios-shortcut`
5. Add **Get Dictionary from Input** on the capture response. Read `receipt` with **Get Dictionary
   Value**, then check that it has a value. If so, show `Saved to Distil` and stop. Both a new
   capture (`202`) and a duplicate (`200`) contain `receipt`.
6. Otherwise read `error` from the response, then `code` from that dictionary. If the code is
   `UNAUTHORIZED`, get the stored `Distil/token.txt` file, **Delete Files** for that file only,
   show `Distil disconnected this iPhone. Share again to pair.` and stop. The next share must
   return to the pairing branch; do not retry with the revoked credential.
7. For any other response without a receipt, show `Distil could not save this link. Try again.`
   and stop. Keep the stored credential for transient failures and rate limits.

Branch on the JSON envelope, not an assumed HTTP-status output from **Get Contents of URL**.
Network or file failures can stop Shortcuts before a dictionary or notification exists. Do not
add an unconditional success notification or assume the platform offers a continue-on-error
setting; the device checklist must exercise these paths. Never open or display raw API responses,
which include a credential during pairing.

Both API actions must use the same Distil origin. The distributed Shortcut uses
`https://distilai.app`; an old Vercel alias or a Preview origin may reach a different deployment
or database. A development copy must keep its credential file separate from the Production copy.

### D. Publish once — Amit

Build and validate the Shortcut on an iPhone, then share the finished, credential-free action
sequence through iCloud. Apple's [sharing guide](https://support.apple.com/en-gb/guide/shortcuts/apdf01f8c054/9.0/ios/26)
describes **Copy iCloud Link** and signed-file sharing. Use one public link for all users; pairing
happens after installation. No real installation URL exists in this repository.

Amit supplies that link as `NEXT_PUBLIC_IOS_SHORTCUT_URL` in Vercel and rebuilds/redeploys so the
Settings link appears. See [deployment configuration](vercel-deployment.md#iphone-shortcut-install-link).
Amit then runs the device checklist above. Repository checks and a curl-based local exchange do
not establish physical-device acceptance.
