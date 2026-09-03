/**
 * Open Graph metadata fetcher.
 *
 * Fetches a URL server-side and extracts structured metadata from the HTML:
 * - Open Graph tags  (<meta property="og:*" content="...">)
 * - Standard meta tags (<meta name="description|author" content="...">)
 * - Fallback <title> tag
 *
 * Used when a new link is saved to Distil so the item is automatically enriched
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
  /** Direct video URL — populated for tweets that contain a video (from fxtwitter). */
  videoUrl?: string | null;
  /** True when the X URL is an X Article (long-form), not a regular tweet. */
  isXArticle?: boolean;
}

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Checks whether a URL points to a Twitter/X post. */
function isTwitterUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    return host === "twitter.com" || host === "x.com";
  } catch {
    return false;
  }
}

/** Returns an OGData object where every field is null. Used as a fallback. */
function emptyOGData(): OGData {
  return { title: null, description: null, image: null, author: null, siteName: null };
}

/**
 * Extracts a tweet ID from a Twitter/X URL.
 * Supports: twitter.com/user/status/ID, x.com/user/status/ID (with optional query params).
 */
function extractTweetId(url: string): string | null {
  const match = url.match(/\/status\/(\d+)/);
  return match?.[1] ?? null;
}

/**
 * Fetches tweet metadata using two strategies in parallel:
 * 1. fxtwitter API — returns full, untruncated tweet text (including long/note tweets),
 *    author info, and media. This is the primary source.
 * 2. Crawler OG tags — Twitter serves images via OG tags to crawler UAs.
 *    Used as a fallback and for tweet preview images.
 *
 * Results are merged: fxtwitter for full text + author, OG for images as fallback.
 */
async function fetchTwitterMetadata(url: string): Promise<OGData> {
  const tweetId = extractTweetId(url);

  const [fxResult, ogFallback] = await Promise.all([
    tweetId ? fetchFxTwitter(tweetId) : Promise.resolve(emptyOGData()),
    fetchTwitterOGFallback(url),
  ]);

  return {
    title: fxResult.title ?? ogFallback.title,
    description: fxResult.description ?? ogFallback.description,
    image: fxResult.image ?? ogFallback.image,
    author: fxResult.author ?? ogFallback.author,
    siteName: fxResult.siteName ?? ogFallback.siteName ?? "X",
    isXArticle: fxResult.isXArticle,
  };
}

/**
 * Fetches full tweet data from the fxtwitter API.
 * This handles Twitter Blue long-form "note tweets" that other APIs truncate.
 */
async function fetchFxTwitter(tweetId: string): Promise<OGData> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`https://api.fxtwitter.com/status/${tweetId}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);
    if (!response.ok) return emptyOGData();

    const data = (await response.json()) as {
      tweet?: {
        text?: string;
        author?: { name?: string; screen_name?: string };
        media?: {
          photos?: Array<{ url?: string }>;
          videos?: Array<{ url?: string; type?: string }>;
        };
        article?: {
          title?: string;
          preview_text?: string;
          cover_media?: {
            media_info?: { original_img_url?: string };
          };
          content?: {
            blocks?: Array<{ text?: string }>;
          };
        };
      };
    };

    const tweet = data.tweet;
    if (!tweet) return emptyOGData();

    const authorName = tweet.author?.name ?? null;
    // Prefer the highest-quality MP4 (fxtwitter lists videos best-quality-first)
    const videoUrl = tweet.media?.videos?.[0]?.url ?? null;

    // X Articles: tweet.text is empty and content lives in tweet.article
    if (!tweet.text && tweet.article) {
      const article = tweet.article;
      const blocks = article.content?.blocks ?? [];
      const articleText = blocks
        .map((b) => b.text)
        .filter(Boolean)
        .join("\n\n");
      return {
        title: article.title ?? (authorName ? `${authorName} on X` : null),
        description: articleText || article.preview_text || null,
        image: article.cover_media?.media_info?.original_img_url ?? null,
        author: authorName,
        siteName: "X",
        videoUrl,
        isXArticle: true,
      };
    }

    const image = tweet.media?.photos?.[0]?.url ?? null;

    return {
      title: authorName ? `${authorName} on X` : null,
      description: tweet.text || null,
      image,
      author: authorName,
      siteName: "X",
      videoUrl,
    };
  } catch {
    clearTimeout(timeoutId);
    return emptyOGData();
  }
}

/**
 * Fallback: fetches OG tags from Twitter using a crawler UA.
 * The description will be truncated for long tweets, but provides images
 * and basic metadata when fxtwitter is unavailable.
 */
async function fetchTwitterOGFallback(url: string): Promise<OGData> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Twitterbot/1.0", Accept: "text/html" },
    });

    clearTimeout(timeoutId);
    if (!response.ok) return emptyOGData();

    const html = await response.text();

    const getMeta = (property: string): string | null => {
      const p1 = new RegExp(
        `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"
      );
      const p2 = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i"
      );
      const match = html.match(p1) ?? html.match(p2);
      return match?.[1]?.trim() ?? null;
    };

    return {
      title: getMeta("og:title"),
      description: getMeta("og:description"),
      image: getMeta("og:image"),
      author: null,
      siteName: getMeta("og:site_name") ?? "X",
    };
  } catch {
    clearTimeout(timeoutId);
    return emptyOGData();
  }
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
 * - Twitter/X URLs use the public oEmbed API instead of scraping, since
 *   Twitter blocks most non-browser requests.
 * - Never throws: all errors (network, timeout, non-200, parse) are caught
 *   and result in emptyOGData() so the caller always gets a safe response.
 *
 * @param url - The URL to fetch and parse.
 * @returns OGData with whatever could be extracted; null for missing fields.
 */
export async function fetchOG(url: string): Promise<OGData> {
  if (isTwitterUrl(url)) {
    return fetchTwitterMetadata(url);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "text/html",
      },
    });

    clearTimeout(timeoutId);

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
      const pattern1 = new RegExp(
        `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
        "i"
      );
      const pattern2 = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
        "i"
      );

      const match = html.match(pattern1) ?? html.match(pattern2);
      return match?.[1]?.trim() ?? null;
    };

    const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const titleTagValue = titleTagMatch?.[1]?.trim() ?? null;

    return {
      title: getMeta("og:title") ?? titleTagValue,
      description: getMeta("og:description") ?? getMeta("description"),
      image: getMeta("og:image"),
      author: getMeta("article:author") ?? getMeta("author"),
      siteName: getMeta("og:site_name"),
    };
  } catch {
    clearTimeout(timeoutId);
    return emptyOGData();
  }
}
