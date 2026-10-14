/**
 * Browser-side platform detection. Keep this module free of server imports; it
 * is read from client components after hydration, never during render.
 */

/**
 * True on iPhone, iPad and iPod touch. iPadOS Safari reports itself as a Mac,
 * so a Mac platform with a touch screen counts as iOS; a Mac with a trackpad
 * reports zero touch points.
 */
export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform || navigator.platform || "";
  if (/iphone|ipad|ipod|^ios$/i.test(platform)) return true;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent ?? "")) return true;
  return /mac/i.test(platform) && (navigator.maxTouchPoints ?? 0) > 1;
}
