---
topic: chrome-extension-web-store
title: Extension private key stored; correction on what losing it means
date: 2026-10-01
time: 08:02
status: in-progress
branch: claude/extension-key-correction
---

## What changed

Correction to the X1/X2 entries: their Next said losing the extension private key "changes the
pinned id". That overstates it. The id `fkodjlobficbnhjidcgeihniinpoiaop`
(`src/lib/extension/constants.ts`) is derived from the public `key` in
`browser-extension/manifest.json`, so every unpacked load keeps that id without the private key.
The private key is only needed to sign a packed `.crx` (or a self-hosted build) under the same id.
The Chrome Web Store may assign its own id to the listing regardless; `DISTIL_EXTENSION_IDS` already
accepts more than one id, and X3 appends the store id.

Amit moved the private key from a temporary agent scratchpad into his own key storage on his Mac,
outside the repository, with owner-only permissions. Its derived public key was checked against the
manifest `key` and matches. The key is never committed (`*.pem` is gitignored).

This entry's `time` is 08:02 so it sorts after the 08:01 release entry; it was written at about
06:50 UTC.

## Verification

Public key derived from the stored private key equals `manifest.json` `key` (compared without
printing either key).

## External resources

None.

## Next

- Amit keeps a second copy of the private key in his password manager.
- Amit removes the old extension once 2.0 has been used for a while; the manual capture token stays
  valid for the iPhone Shortcut.
- X3: unlisted Chrome Web Store listing, starting from `main`.
