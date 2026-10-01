---
topic: iphone-shortcut-token
title: iPhone Shortcut D1–D3 decisions answered (1A 2A 3A 4A 5A)
date: 2026-09-30
time: 18:40
status: planned
branch: claude/iphone-shortcut-decisions
---

## What changed

Amit answered the D1–D3 decisions in chat on 2026-09-30 (checkpoint "iPhone Shortcut without a
visible token: design and phased plan (D1–D3) — 2026-09-30" in `docs/project-state.md`):

1. **1A** Shape: device pairing as designed (no Safari-open variant).
2. **2A** Pairing code: eight Crockford base32 characters `XXXX-XXXX`, valid ten minutes.
3. **3A** Phone credential lifetime: until disconnected, like the account token.
4. **4A** Distribution: Amit signs and shares one iCloud link and sets
   `NEXT_PUBLIC_IOS_SHORTCUT_URL` in Vercel himself.
5. **5A** Order: X1 first, then D1 adds the `phone` kind on X1's `kind`/`label` columns. Amit
   started X1 (with X2) the same day on `claude/chrome-extension-x1-x2`, which fixes this order.

No code changed.

## Verification

Docs only.

## External resources

None touched.

## Next

- Start D1 as its own task from `main` after X1 merges. The checkpoint names the migration
  `0015_phone_pairing.sql`; the Collections drop (PR #114) and Chrome X1/X2 both add a tenant
  migration numbered 0014, so take the next free number at start time.
- D3 needs Amit's iPhone to build and share the Shortcut and his Vercel change for
  `NEXT_PUBLIC_IOS_SHORTCUT_URL`.
