/** Human label for a browser connection, derived from a user-agent string ("Chrome on macOS"). */
export function describeBrowser(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Brave\//.test(userAgent)
      ? "Brave"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : "Browser";
  const system = /Windows/.test(userAgent)
    ? "Windows"
    : /CrOS/.test(userAgent)
      ? "ChromeOS"
      : /Android/.test(userAgent)
        ? "Android"
        : /Mac OS X|Macintosh/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : undefined;
  return system ? `${browser} on ${system}` : browser;
}
