/**
 * Browser-safe configuration surface. Keep this module limited to values that
 * Next may inline into client bundles; server configuration belongs in
 * `config.ts`.
 */
export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/** Signed iCloud Shortcut share link; omitted until the Shortcut is ready to distribute. */
export const iosShortcutUrl = process.env.NEXT_PUBLIC_IOS_SHORTCUT_URL?.trim() ?? "";
