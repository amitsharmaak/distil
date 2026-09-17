/**
 * Browser-safe configuration surface. Keep this module limited to values that
 * Next may inline into client bundles; server configuration belongs in
 * `config.ts`.
 */
export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
