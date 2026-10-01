import {
  cardExcerpt,
  displayTitle,
  publisherLabel,
  readingMinutes,
  readTimeLabel,
} from "../display";

describe("publisherLabel and displayTitle", () => {
  it("prefers publication, then a hostname, and handles missing or invalid URLs", () => {
    expect(
      publisherLabel({ publication: "Example &amp; Co", url: "https://www.example.test/a" })
    ).toBe("Example & Co");
    expect(publisherLabel({ url: "https://www.example.test/a" })).toBe("example.test");
    expect(publisherLabel({ url: "javascript:alert(1)" })).toBe("Saved item");
    expect(publisherLabel({ url: "not-a-url" })).toBe("Saved item");
  });

  it.each([
    [
      "A clear headline | Example Review",
      "https://example.test/a",
      "Example Review",
      "A clear headline",
    ],
    ["A clear headline | Example", "https://example.test/a", undefined, "A clear headline"],
    ["A clear headline — example.test", "https://example.test/a", undefined, "A clear headline"],
    ["Something - BBC", "https://news.bbc.co.uk/a", undefined, "Something"],
    ["A video - YouTube", "https://youtu.be/id", undefined, "A video"],
    [
      "What changed - part two - YouTube",
      "https://www.youtube.com/watch?v=id",
      undefined,
      "What changed - part two",
    ],
    ["A video | Creator - YouTube", "https://www.youtube.com/watch?v=id", "Creator", "A video"],
  ])("removes only a matching site suffix from %s", (title, url, publication, expected) => {
    expect(displayTitle({ title, url, publication })).toBe(expected);
  });

  it("preserves meaningful punctuation and unmatched suffixes", () => {
    expect(
      displayTitle({ title: "Trade-offs | A different perspective", url: "https://example.test" })
    ).toBe("Trade-offs | A different perspective");
    expect(displayTitle({ title: "A history - YouTube", url: "https://example.test" })).toBe(
      "A history - YouTube"
    );
    expect(displayTitle({ title: "Example", url: "https://example.test" })).toBe("Example");
    expect(displayTitle({ title: "", url: "https://example.test" })).toBe("Untitled");
    expect(displayTitle({ title: "  ", url: "" })).toBe("Untitled");
  });

  it("preserves the reader fallback for URL titles with a readable summary sentence", () => {
    expect(
      displayTitle({
        title: "https://example.test/story",
        url: "https://example.test/story",
        summary: "## TL;DR\nA readable **summary** sentence. Another sentence.",
      })
    ).toBe("A readable summary sentence.");
    expect(
      displayTitle({ title: "https://example.test/story", url: "https://example.test/story" })
    ).toBe("Untitled");
    const title = displayTitle({ title: "", url: "", summary: "word ".repeat(40) });
    expect(title.length).toBeLessThanOrEqual(100);
    expect(title).toMatch(/word…$/);
  });
});

describe("cardExcerpt", () => {
  it("uses the brief's first sentence, without headings or markdown", () => {
    expect(
      cardExcerpt({
        summary: "Fallback summary.",
        aiSummary:
          "## TL;DR\n\nA **useful** [brief](https://example.test). Another sentence.\n\n## Key Points\n- Not the excerpt.",
      })
    ).toBe("A useful brief.");
  });

  it.each([
    "## Overview\nA useful lead.\n\n## Context\nMore context.",
    "**TL;DR**\nA useful lead.",
    "<h2>TL;DR</h2><p>A useful lead.</p>",
    "TL;DR\nA useful lead.",
    "TL;DR: A useful lead.",
  ])("removes section-label remnants from %s", (summary) => {
    expect(cardExcerpt({ summary })).toBe("A useful lead.");
  });

  it("never cuts a word, including an exact word boundary", () => {
    const summary = "Alpha beta gamma delta epsilon.";
    expect(cardExcerpt({ summary }, 16)).toBe("Alpha beta…");
    expect(cardExcerpt({ summary }, 17)).toBe("Alpha beta gamma…");
    expect(cardExcerpt({ summary: "Supercalifragilistic" }, 5)).toBe("");
    expect(cardExcerpt({ summary }, 0)).toBe("");
  });

  it.each([
    ["Version 2.5 is ready. More detail.", "Version 2.5 is ready."],
    ["Dr. Alice explains the result. More detail.", "Dr. Alice explains the result."],
    ["Is this ready? Here is why.", "Is this ready?"],
    ["The answer is “yes!” More detail.", "The answer is “yes!”"],
  ])("keeps sentence punctuation in %s", (summary, expected) => {
    expect(cardExcerpt({ summary })).toBe(expected);
  });

  it.each([
    "A clear explanation",
    "A clear explanation - YouTube",
    "YouTube video: A clear explanation.",
  ])("suppresses a title-only video excerpt: %s", (summary) => {
    expect(
      cardExcerpt({
        title: "A clear explanation - YouTube",
        url: "https://www.youtube.com/watch?v=id",
        contentType: "video",
        summary,
      })
    ).toBe("");
  });

  it("keeps useful video descriptions and gracefully handles empty briefs", () => {
    expect(
      cardExcerpt({
        title: "A clear explanation",
        contentType: "video",
        summary: "The speaker demonstrates two techniques.",
      })
    ).toBe("The speaker demonstrates two techniques.");
    expect(cardExcerpt({ aiSummary: "## TL;DR" })).toBe("");
    expect(cardExcerpt({ aiSummary: "## Key Points\n- Only a point." })).toBe("");
    expect(cardExcerpt({})).toBe("");
  });
});

describe("readingMinutes and readTimeLabel", () => {
  it("uses feed estimates before summary text and keeps nonempty content at one minute", () => {
    expect(readingMinutes({ readingMinutes: 8, summary: "Short card text." })).toBe(8);
    expect(readTimeLabel({ readingMinutes: 8 })).toBe("8 min read");
    expect(readingMinutes({ fullContent: "<p>" + "word ".repeat(300) + "</p>" })).toBe(2);
    expect(readingMinutes({ summary: "A few words." })).toBe(1);
    expect(readingMinutes({ summary: "", readingMinutes: 0 })).toBe(0);
    expect(readTimeLabel({})).toBe("");
  });

  it("prefers video duration over the transcript estimate and preserves its display format", () => {
    expect(readingMinutes({ contentType: "video", duration: "27:30", readingMinutes: 8 })).toBe(28);
    expect(readingMinutes({ contentType: "video", duration: "1:02:30" })).toBe(63);
    expect(readingMinutes({ contentType: "video", duration: "12 min" })).toBe(12);
    expect(readTimeLabel({ contentType: "video", duration: "27:30", readingMinutes: 8 })).toBe(
      "27:30"
    );
    expect(readTimeLabel({ contentType: "video" })).toBe("");
    expect(readTimeLabel({ contentType: "video", duration: "5:99" })).toBe("");
  });

  it("ignores invalid estimates and markup-only text", () => {
    expect(readingMinutes({ readingMinutes: Number.NaN, summary: "Short read." })).toBe(1);
    expect(readingMinutes({ readingMinutes: -8, fullContent: "<p></p>" })).toBe(0);
  });
});
