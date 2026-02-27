/**
 * Open Graph metadata fetcher.
 *
 * Fetches a URL server-side and extracts structured metadata from the HTML:
 * - Open Graph tags  (<meta property="og:*" content="...">)
 * - Standard meta tags (<meta name="description|author" content="...">)
 * - Fallback <title> tag
 *
 * Used when a new link is saved to PIA so the item is automatically enriched
 * with a title, description, thumbnail, and author — without the user having
 * to type them manually.
 *
 * This module must only be imported in server-side code (API routes, Server
 * Components). It uses the Node.js `fetch` global (available in Next.js 13+).
 */

/** Shape of the metadata returned by fetchOG. All fields are nullable. */
export interface OGData {
  /** Page title from og:title or <title> tag. */
  title: string | null;
  /** Page description from og:description or meta description. */
  description: string | null;
  /** Preview image URL from og:image. */
  image: string | null;
  /** Author name from article:author or meta author. */
  author: string | null;
  /** Site/publication name from og:site_name. */
  siteName: string | null;
}

/** Returns an OGData object where every field is null. Used as a fallback. */
function emptyOGData(): OGData {
  return { title: null, description: null, image: null, author: null, siteName: null };
}

/**
 * Fetches the given URL and extracts Open Graph / meta tag data from the HTML.
 *
 * Design decisions:
 * - 5-second timeout: prevents slow or hanging pages from blocking the API.
 * - Regex-based parsing: avoids adding an HTML parser dependency. Works for
 *   the vast majority of modern sites that emit well-formed meta tags.
 * - Handles both attribute orderings of <meta> tags:
 *     <meta property="og:title" content="...">   (property first)
 *     <meta content="..." property="og:title">   (content first)
 * - Never throws: all errors (network, timeout, non-200, parse) are caught
 *   and result in emptyOGData() so the caller always gets a safe response.
 *
 * @param url - The URL to fetch and parse.
 * @returns OGData with whatever could be extracted; null for missing fields.
 */
export async function fetchOG(url: string): Promise<OGData> {
  // Set up a 5-second timeout via AbortController.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Identify ourselves politely; some sites block requests with no UA.
        "User-Agent": "PIA/1.0 (link preview; +https://github.com/pia-app/pia)",
        // We only need the HTML, not binary assets.
        Accept: "text/html",
      },
    });

    clearTimeout(timeoutId);

    // Non-OK responses (4xx, 5xx) are not worth trying to parse.
    if (!response.ok) {
      return emptyOGData();
    }

    const html = await response.text();

    /**
     * Extracts the `content` attribute value for a given meta property/name.
     *
     * Handles two attribute orderings:
     *   <meta property="og:title" content="My Title">
     *   <meta content="My Title" property="og:title">
     *
     * The `i` flag makes matching case-insensitive for robustness.
     */
    const getMeta = (property: string): string | null => {
      // Pattern 1: property/name attribute appears before content attribute.
      const pattern1 = new RegExp(
        `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
        "i"
      );
      // Pattern 2: content attribute appears before property/name attribute.
      const pattern2 = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
        "i"
      );

      const match = html.match(pattern1) ?? html.match(pattern2);
      return match?.[1]?.trim() ?? null;
    };

    // Extract the <title> tag as a fallback when og:title is missing.
    const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const titleTagValue = titleTagMatch?.[1]?.trim() ?? null;

    return {
      // Prefer og:title over the plain <title> tag.
      title: getMeta("og:title") ?? titleTagValue,
      // Prefer og:description over the standard meta description.
      description: getMeta("og:description") ?? getMeta("description"),
      // Thumbnail image for the item card.
      image: getMeta("og:image"),
      // article:author is used by many news/blog sites; fall back to generic author meta.
      author: getMeta("article:author") ?? getMeta("author"),
      // Publication/site name (e.g. "The Verge", "Hacker News").
      siteName: getMeta("og:site_name"),
    };
  } catch {
    // Any error (network failure, timeout abort, parse error) → safe empty result.
    clearTimeout(timeoutId);
    return emptyOGData();
  }
}
