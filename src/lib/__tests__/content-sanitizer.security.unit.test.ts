import { sanitizeArticleHtml } from "@/lib/content-sanitizer";

describe("article HTML sanitization", () => {
  it("removes executable markup and unsafe URL protocols", () => {
    const sanitized = sanitizeArticleHtml(`
      <script>alert(1)</script>
      <svg onload="alert(2)"><a href="javascript:alert(3)">bad</a></svg>
      <iframe srcdoc="<script>alert(4)</script>"></iframe>
      <img src="https://images.example.test/a.png" onerror="alert(5)">
      <a href="javascript:alert(6)" onclick="alert(7)">unsafe</a>
      <a href="https://example.test/story">safe</a>
    `);

    expect(sanitized).not.toMatch(/script|svg|iframe|onerror|onclick|javascript:|srcdoc/i);
    expect(sanitized).toContain('src="https://images.example.test/a.png"');
    expect(sanitized).toContain('href="https://example.test/story"');
    expect(sanitized).toContain('rel="noopener noreferrer"');
  });

  it("disallows data images and protocol-relative resources", () => {
    const sanitized = sanitizeArticleHtml(
      '<img src="data:image/svg+xml,bad"><img src="//internal.test/a.png">'
    );
    expect(sanitized).not.toContain("data:");
    expect(sanitized).not.toContain("//internal.test");
  });

  it("does not revive executable markup from malformed raw-text elements", () => {
    const sanitized = sanitizeArticleHtml(
      "<xmp><img src=x onerror=alert(1)></xmp><textarea>&lt;script&gt;alert(2)&lt;/script&gt;</textarea>"
    );
    expect(sanitized).not.toMatch(/img|onerror|script|textarea|xmp/i);
  });
});
