import {
  CITATION_LINK_TITLE,
  CITATION_REF_TITLE,
  linkCitationMarkers,
  markerRunIds,
  sourceAnchorId,
  compactCitationLinks,
  countWords,
  createSlugger,
  estimateReadingMinutes,
  extractHeadings,
  extractSummary,
  prepareReport,
  slugify,
  stripTitleAndRules,
} from "@/components/research/report-markdown";

/** Shaped like the stored legacy reports (duplicate H1, rules, fixed template, inline links). */
const LEGACY_REPORT = [
  "# Research Report: How do small teams ship safely?",
  "",
  "## Executive Summary",
  "Small teams ship safely with short branches and fast checks.",
  "",
  "---",
  "",
  "## Key Findings",
  "",
  "### Branching",
  "- Short-lived branches reduce conflicts ([Guide](https://www.example.com/guides/branching), [Blog](https://blog.example.org/post))",
  "",
  "### Checks",
  "- A one-minute gate keeps feedback fast (Source: [Docs](https://docs.example.net/ci))",
  "",
  "***",
  "",
  "## Analysis",
  "Details here, see [the handbook](https://handbook.example.com/) for more.",
  "",
  "## Conclusion",
  "Keep it small.",
].join("\n");

describe("slugify and createSlugger", () => {
  it("makes lowercase hyphenated ASCII slugs", () => {
    expect(slugify("Key Findings & Analysis")).toBe("key-findings-and-analysis");
    expect(slugify("  Café — Überblick! ")).toBe("cafe-uberblick");
    expect(slugify("???")).toBe("section");
  });

  it("de-duplicates repeated headings and respects reserved ids", () => {
    const slug = createSlugger(["tldr"]);
    expect(slug("Overview")).toBe("overview");
    expect(slug("Overview")).toBe("overview-2");
    expect(slug("Overview")).toBe("overview-3");
    expect(slug("TL;DR")).toBe("tl-dr");
    expect(slug("tldr")).toBe("tldr-2");
  });
});

describe("stripTitleAndRules", () => {
  it("drops the leading H1 and thematic breaks", () => {
    const cleaned = stripTitleAndRules(LEGACY_REPORT);
    expect(cleaned).not.toMatch(/^# /m);
    expect(cleaned).not.toContain("Research Report:");
    expect(cleaned).not.toMatch(/^\s*(---|\*\*\*)\s*$/m);
    expect(cleaned.startsWith("## Executive Summary")).toBe(true);
  });

  it("keeps a leading summary H1 and demotes later H1s to H2", () => {
    const cleaned = stripTitleAndRules("# Executive Summary\nTop line.\n\n# Details\nMore.");
    expect(cleaned).toBe("## Executive Summary\nTop line.\n\n## Details\nMore.");
  });

  it("keeps setext underlines, table rules and fenced code untouched", () => {
    const markdown = [
      "Heading text",
      "---",
      "",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "```",
      "# not a heading",
      "---",
      "```",
    ].join("\n");
    expect(stripTitleAndRules(markdown)).toBe(markdown);
  });
});

describe("compactCitationLinks", () => {
  it("turns parenthesised citation groups into marked bare links", () => {
    const out = compactCitationLinks(
      "Fact one ([A](https://a.example/x), [B](https://b.example/y)).\nFact two (Source: [C](https://c.example)).\nFact three (https://d.example/z)."
    );
    expect(out).toBe(
      [
        `Fact one [A](https://a.example/x "${CITATION_LINK_TITLE}") [B](https://b.example/y "${CITATION_LINK_TITLE}").`,
        `Fact two [C](https://c.example "${CITATION_LINK_TITLE}").`,
        `Fact three [https://d.example/z](https://d.example/z "${CITATION_LINK_TITLE}").`,
      ].join("\n")
    );
  });

  it("leaves links in running prose and ordinary parentheses alone", () => {
    const text = "Read [the guide](https://a.example) (it is short) today.";
    expect(compactCitationLinks(text)).toBe(text);
  });
});

describe("extractSummary", () => {
  it.each([
    ["## TL;DR\nShort.\n\n## Next\nBody.", "Short."],
    ["## TLDR:\nShort.\n\n## Next\nBody.", "Short."],
    ["## Summary\nShort.\n\n## Next\nBody.", "Short."],
    ["### **Executive Summary**\nShort.\n\n## Next\nBody.", "Short."],
  ])("lifts the summary out of %j", (markdown, summary) => {
    const result = extractSummary(markdown);
    expect(result.summary).toBe(summary);
    expect(result.rest).toBe("## Next\nBody.");
  });

  it("keeps sub-headings of the summary inside it", () => {
    const result = extractSummary("## Summary\nLead.\n### Detail\nMore.\n## Next\nBody.");
    expect(result.summary).toBe("Lead.\n### Detail\nMore.");
    expect(result.rest).toBe("## Next\nBody.");
  });

  it("returns the markdown unchanged when there is no summary heading", () => {
    const markdown = "## Findings\nNo summary here.\n\n## Summary of risks is not a summary";
    expect(extractSummary(markdown)).toEqual({ summary: null, rest: markdown });
  });

  it("ignores an empty summary section", () => {
    const markdown = "## Summary\n\n## Findings\nBody.";
    expect(extractSummary(markdown).summary).toBeNull();
  });
});

describe("extractHeadings", () => {
  it("collects ## and ### headings with plain text, line numbers and unique ids", () => {
    const markdown = [
      "## Overview", // 1
      "Text.", // 2
      "### **Bold** and [link](https://x.example)", // 3
      "#### Too deep", // 4
      "```", // 5
      "## inside code", // 6
      "```", // 7
      "## Overview", // 8
      "## `Code` heading ##", // 9
    ].join("\n");
    expect(extractHeadings(markdown)).toEqual([
      { level: 2, text: "Overview", id: "overview", line: 1 },
      { level: 3, text: "Bold and link", id: "bold-and-link", line: 3 },
      { level: 2, text: "Overview", id: "overview-2", line: 8 },
      { level: 2, text: "Code heading", id: "code-heading", line: 9 },
    ]);
  });

  it("never reuses the TL;DR anchor id", () => {
    expect(extractHeadings("## tldr")[0].id).toBe("tldr-2");
  });
});

describe("reading stats", () => {
  it("counts words without URLs or markdown syntax", () => {
    expect(
      countWords("## Two words\n- [linked text](https://example.com/a/b) plus https://x.y")
    ).toBe(5);
  });

  it("estimates at least one minute", () => {
    expect(estimateReadingMinutes(0)).toBe(1);
    expect(estimateReadingMinutes(789)).toBe(3);
    expect(estimateReadingMinutes(2300)).toBe(10);
  });
});

describe("prepareReport", () => {
  it("cleans a legacy report into summary, body, headings and stats", () => {
    const prepared = prepareReport(LEGACY_REPORT);
    expect(prepared.summary).toBe("Small teams ship safely with short branches and fast checks.");
    expect(prepared.body).not.toContain("Research Report:");
    expect(prepared.body).not.toContain("Executive Summary");
    expect(prepared.body).not.toMatch(/^\s*(---|\*\*\*)\s*$/m);
    expect(prepared.body).not.toContain("([Guide]");
    expect(prepared.body).toContain(
      `[Guide](https://www.example.com/guides/branching "${CITATION_LINK_TITLE}")`
    );
    expect(prepared.headings.map((heading) => [heading.level, heading.id])).toEqual([
      [2, "key-findings"],
      [3, "branching"],
      [3, "checks"],
      [2, "analysis"],
      [2, "conclusion"],
    ]);
    expect(prepared.sectionCount).toBe(3);
    expect(prepared.readingMinutes).toBe(1);
    // Line numbers point into the body that is rendered.
    const bodyLines = prepared.body.split("\n");
    for (const heading of prepared.headings) {
      expect(bodyLines[heading.line - 1]).toMatch(/^#{2,3} /);
    }
  });

  it("renders a report with no summary heading as body only", () => {
    const prepared = prepareReport("Just a paragraph with no headings.");
    expect(prepared.summary).toBeNull();
    expect(prepared.body).toBe("Just a paragraph with no headings.");
    expect(prepared.headings).toEqual([]);
    expect(prepared.sectionCount).toBe(0);
  });

  it("tolerates an empty report", () => {
    expect(prepareReport("")).toMatchObject({ summary: null, body: "", headings: [] });
  });
});

describe("linkCitationMarkers", () => {
  const ref = (ids: string, first: number) => `[${ids}](#source-${first} "${CITATION_REF_TITLE}")`;

  it("turns each run of adjacent markers into one in-page link to the first source", () => {
    expect(linkCitationMarkers("A [2]. B [1][3]. C [1, 2].", [1, 2, 3])).toBe(
      `A ${ref("2", 2)}. B ${ref("1,3", 1)}. C ${ref("1,2", 1)}.`
    );
  });

  it("keeps unknown ids as plain text and drops them from a mixed run", () => {
    expect(linkCitationMarkers("X [9]. Y [1][9].", [1])).toBe(`X [9]. Y ${ref("1", 1)}.`);
  });

  it("leaves code, links, images, reference definitions and escaped brackets alone", () => {
    const markdown = [
      "Inline `a[1]` and [1](https://x.example) and ![1](img.png) and \\[1] and [text][1]",
      "```",
      "arr[1]",
      "```",
      "[1]: https://x.example",
    ].join("\n");
    expect(linkCitationMarkers(markdown, [1])).toBe(markdown);
  });

  it("changes nothing without known ids and keeps line numbers", () => {
    expect(linkCitationMarkers("Claim [1].", [])).toBe("Claim [1].");
    const markdown = "## Heading [1]\nText [1]\n## Next";
    const linked = linkCitationMarkers(markdown, [1]);
    expect(linked.split("\n")).toHaveLength(3);
    expect(extractHeadings(linked).map((heading) => heading.line)).toEqual([1, 3]);
  });

  it("reads the ids of a marker run", () => {
    expect(markerRunIds("[3][1, 3]")).toEqual([3, 1]);
    expect(sourceAnchorId(4)).toBe("source-4");
  });
});
