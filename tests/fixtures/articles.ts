/**
 * Deterministic article bodies served by the local HTTP fixture server.
 * Keep these free of third-party URLs so parsing tests cannot accidentally
 * escape to the public network.
 */
export const NORMAL_ARTICLE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>How local-first capture stays reliable</title>
    <meta name="description" content="A fixture article about reliable capture.">
    <meta property="og:title" content="Reliable capture">
    <meta property="og:description" content="A deterministic fixture article.">
    <meta property="og:image" content="/assets/capture.png">
    <meta name="author" content="Distil Fixtures">
  </head>
  <body>
    <main>
      <article>
        <h1>How local-first capture stays reliable</h1>
        <p>Durable capture starts by saving intent before doing expensive work.</p>
        <p>A worker can then retry extraction without asking the reader to submit again.</p>
      </article>
    </main>
  </body>
</html>`;

export const CANONICAL_ARTICLE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>A duplicate tracking URL</title>
    <link rel="canonical" href="/article/canonical-source">
    <meta property="og:url" content="/article/canonical-source">
  </head>
  <body>
    <article><h1>Canonical capture</h1><p>This page has a canonical URL.</p></article>
  </body>
</html>`;

export const MISSING_METADATA_ARTICLE_HTML = `<!doctype html>
<html><body><article><h1>Title only in the body</h1><p>No metadata is present.</p></article></body></html>`;

export const MALFORMED_ARTICLE_HTML = `<!doctype html><html><head><title>Broken fixture<body><article><h1>Unclosed heading<p>Malformed but readable content`;

export const NON_CONTENT_BODY = "%PDF-1.7\n% deterministic non-content fixture\n";

/** Larger than the default 2 MiB response limit used by capture tests. */
export const OVERSIZED_ARTICLE_BYTES = 2 * 1024 * 1024 + 1;

export function createOversizedArticleHtml(byteLength = OVERSIZED_ARTICLE_BYTES): string {
  const prefix = "<!doctype html><html><body><article>";
  const suffix = "</article></body></html>";

  if (byteLength < prefix.length + suffix.length) {
    throw new RangeError("Oversized fixture must fit the HTML wrapper");
  }

  return `${prefix}${"x".repeat(byteLength - prefix.length - suffix.length)}${suffix}`;
}
