import {
  assembleReport,
  capReportSections,
  cleanHeading,
  countSectionWords,
  cleanSectionBody,
  fallbackOutline,
  IncompleteSectionError,
  InvalidOutlineError,
  isUsableFinding,
  limitTldr,
  MAX_TLDR_WORDS,
  MAX_REPORT_SECTIONS,
  MAX_REPORT_WORDS,
  MAX_SECTION_WORDS,
  MIN_SECTION_BUDGET_WORDS,
  parseOutline,
  reportFrameWords,
  sectionPlaceholder,
  sectionWordBudget,
  type ResearchOutline,
} from "../research-report";
import { finalizeCitations, type SourceCatalog } from "../research-sources";
import {
  buildSectionPrompt,
  itemPlanContext,
  RESEARCH_ITEM_CONTEXT_MAX_CHARS,
  type ResearchRunState,
} from "../research";

jest.mock("@/lib/queue/research-dispatch", () => ({ resolveResearchDispatcher: jest.fn() }));
jest.mock("../router", () => ({
  createTenantAIRouter: jest.fn(),
  getEffectiveModel: jest.fn(() => ({ provider: "gemini", model: "gemini-test" })),
}));

const catalog: SourceCatalog = {
  sources: [1, 2, 3].map((id) => ({
    id,
    url: `https://s${id}.example/page`,
    title: `Source ${id}`,
    domain: `s${id}.example`,
    grounded: true,
  })),
  idsByFinding: [[1], [2], [3]],
};

function words(count: number, lead = "Text"): string {
  return `${lead} ${Array.from({ length: count }, (_, index) => `w${index}`).join(" ")}.`;
}

const validOutline = {
  shape: "landscape",
  tldr: "  Three approaches dominate [1].\nOne leads [2]. ",
  takeaways: ["- Apple ships a 3B model [1].", "Google's Nano runs on 2 phones [2].", 7],
  sections: [
    {
      heading: "## **On-device models:**",
      purpose: "p1",
      findings: [1],
      sourceIds: [1, 99],
      format: "prose",
    },
    {
      heading: "Hybrid approaches",
      purpose: "p2",
      findings: ["F2", 3],
      sourceIds: [2, 3],
      format: "table",
    },
    {
      heading: "hybrid approaches",
      purpose: "duplicate",
      findings: [1],
      sourceIds: [],
      format: "prose",
    },
    {
      heading: "Key takeaways",
      purpose: "reserved",
      findings: [1],
      sourceIds: [],
      format: "prose",
    },
    { heading: "What to watch", purpose: "p3", findings: [9], sourceIds: [], format: "diagram" },
  ],
  caveats: ["Figures are vendor-reported [3].", "", "Open: battery cost."],
};

describe("parseOutline", () => {
  it("normalises a model outline: headings, finding numbers, known source ids, formats", () => {
    const outline = parseOutline(validOutline, [0, 1, 2], catalog);
    expect(outline).toEqual<ResearchOutline>({
      shape: "landscape",
      tldr: "Three approaches dominate [1]. One leads [2].",
      takeaways: ["Apple ships a 3B model [1].", "Google's Nano runs on 2 phones [2]."],
      sections: [
        {
          heading: "On-device models",
          purpose: "p1",
          findings: [0],
          sourceIds: [1],
          format: "prose",
        },
        {
          heading: "Hybrid approaches",
          purpose: "p2",
          findings: [1, 2],
          sourceIds: [2, 3],
          format: "table",
        },
        // An unknown finding number falls back to every usable finding; unknown format → prose.
        {
          heading: "What to watch",
          purpose: "p3",
          findings: [0, 1, 2],
          sourceIds: [],
          format: "prose",
        },
      ],
      caveats: ["Figures are vendor-reported [3].", "Open: battery cost."],
    });
  });

  it("maps F numbers through the usable findings, skipping failed ones", () => {
    const outline = parseOutline(
      { ...validOutline, sections: validOutline.sections.slice(0, 2) },
      [0, 2],
      catalog
    );
    expect(outline.sections.map((section) => section.findings)).toEqual([[0], [2]]);
  });

  it("caps sections, takeaways and caveats and defaults an unknown shape to other", () => {
    const outline = parseOutline(
      {
        shape: "essay",
        tldr: "T",
        takeaways: Array.from({ length: 9 }, (_, index) => `Takeaway ${index}`),
        sections: Array.from({ length: 9 }, (_, index) => ({
          heading: `Section ${index}`,
          purpose: "",
          findings: [1],
          sourceIds: [],
          format: "bullets",
        })),
        caveats: Array.from({ length: 9 }, (_, index) => `Caveat ${index}`),
      },
      [0],
      catalog
    );
    expect(outline.shape).toBe("other");
    expect(MAX_REPORT_SECTIONS).toBe(4);
    expect(outline.sections).toHaveLength(4);
    expect(outline.sections.map((section) => section.heading)).toEqual([
      "Section 0",
      "Section 1",
      "Section 2",
      "Section 3",
    ]);
    expect(outline.takeaways).toHaveLength(5);
    expect(outline.caveats).toHaveLength(4);
  });

  it.each([
    ["not an object", "not json"],
    ["no sections", { ...validOutline, sections: [] }],
    ["an empty TL;DR", { ...validOutline, tldr: "  " }],
    ["no takeaways", { ...validOutline, takeaways: [] }],
    [
      "one section when two findings are usable",
      { ...validOutline, sections: validOutline.sections.slice(0, 1) },
    ],
  ])("rejects %s", (_case, value) => {
    expect(() => parseOutline(value, [0, 1], catalog)).toThrow(InvalidOutlineError);
  });

  it("accepts a single section when only one finding is usable", () => {
    expect(
      parseOutline({ ...validOutline, sections: validOutline.sections.slice(0, 1) }, [0], catalog)
        .sections
    ).toHaveLength(1);
  });
});

describe("fallbackOutline", () => {
  const findings = [
    { question: "What is **X**?", notes: "- X is a thing that does work.\n- more" },
    { question: "Who uses X?", notes: "(Research on this question failed.)" },
    { question: "Deeper gap", notes: "Intro line with enough words here.\n- short" },
  ];

  it("builds one section per usable finding with its sources, facts as takeaways", () => {
    const outline = fallbackOutline(findings, catalog);
    expect(outline).toEqual({
      shape: "other",
      fallback: true,
      tldr: "X is a thing that does work [1]. Intro line with enough words here [3].",
      takeaways: ["X is a thing that does work [1].", "Intro line with enough words here [3]."],
      sections: [
        {
          heading: "What is X?",
          purpose: "Answer the research question: What is **X**?",
          findings: [0],
          sourceIds: [1],
          format: "prose",
        },
        {
          heading: "Deeper gap",
          purpose: "Answer the research question: Deeper gap",
          findings: [2],
          sourceIds: [3],
          format: "prose",
        },
      ],
      caveats: [
        expect.stringContaining("could not be planned automatically"),
        "Research on 1 of 3 questions failed, so those parts of the question are not covered.",
      ],
    });
    expect(isUsableFinding(findings[1]!)).toBe(false);
  });

  it("folds findings beyond the section cap into the last section", () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      question: `Question ${index}`,
      notes: `- Fact number ${index} is specific.`,
    }));
    const outline = fallbackOutline(many, { sources: [], idsByFinding: [] });
    expect(outline.sections).toHaveLength(4);
    expect(outline.sections.at(-1)!.findings).toEqual([3, 4, 5, 6, 7]);
  });

  it("keeps at most four sections and folds the extra findings' sources into the last", () => {
    const six = Array.from({ length: 6 }, (_, index) => ({
      question: `Question ${index}`,
      notes: `- Fact number ${index} is specific.`,
    }));
    const outline = fallbackOutline(six, {
      sources: [],
      idsByFinding: [[1], [2], [3], [4], [5], [6]],
    });
    expect(outline.sections.length).toBeLessThanOrEqual(MAX_REPORT_SECTIONS);
    expect(outline.sections.map((section) => section.findings)).toEqual([[0], [1], [2], [3, 4, 5]]);
    expect(outline.sections.at(-1)!.sourceIds).toEqual([4, 5, 6]);
  });
});

describe("cleanSectionBody", () => {
  it("drops a repeated heading, demotes # and ## headings and removes a Sources trailer", () => {
    const answer = [
      "## Hybrid approaches",
      "",
      words(40, "Intro [1]"),
      "",
      "## A sub-point",
      words(30),
      "",
      "```",
      "## code stays",
      "```",
      "",
      "**Sources:**",
      "- [1] Source 1",
    ].join("\n");
    expect(cleanSectionBody(answer, "Hybrid approaches")).toBe(
      [
        words(40, "Intro [1]"),
        "",
        "### A sub-point",
        words(30),
        "",
        "```",
        "## code stays",
        "```",
      ].join("\n")
    );
  });

  it("unwraps an outer markdown fence and a bold heading line", () => {
    const answer = `\`\`\`markdown\n**Hybrid approaches**\n\n${words(70)}\n\`\`\``;
    expect(cleanSectionBody(answer, "Hybrid approaches")).toBe(words(70));
  });

  it("keeps a GFM table and ### subheadings", () => {
    const table = "| A | B |\n| --- | --- |\n| 1 [2] | 2 |";
    const answer = `${words(40)}\n\n${table}\n\n### Detail\n\n${words(30)}`;
    expect(cleanSectionBody(answer, "Other")).toBe(answer);
  });

  it("rejects an answer that is too short to be a section", () => {
    expect(() => cleanSectionBody("## Heading\n\nJust a line [1].", "Heading")).toThrow(
      IncompleteSectionError
    );
  });
});

describe("assembleReport", () => {
  const outline: ResearchOutline = {
    shape: "comparison",
    tldr: "Answer [3].",
    takeaways: ["Fact A [1].", "Fact B [3]."],
    sections: [
      { heading: "Option A", purpose: "", findings: [0], sourceIds: [1], format: "prose" },
      { heading: "Side by side", purpose: "", findings: [1], sourceIds: [2], format: "table" },
    ],
    caveats: ["Thin evidence [2]."],
  };

  it("orders TL;DR, key takeaways, the sections and caveats as ## headings", () => {
    const markdown = assembleReport(outline, ["Body A [1].", sectionPlaceholder([2])]);
    expect(markdown).toBe(
      [
        "## TL;DR",
        "Answer [3].",
        "## Key takeaways",
        "- Fact A [1].\n- Fact B [3].",
        "## Option A",
        "Body A [1].",
        "## Side by side",
        "*This section could not be written; see sources [2].*",
        "## Caveats and open questions",
        "- Thin evidence [2].",
      ].join("\n\n") + "\n"
    );
    // Citations are renumbered across the whole document, cited sources only.
    const cited = finalizeCitations(markdown, catalog.sources);
    expect(cited.sources.map((source) => source.url)).toEqual([
      "https://s3.example/page",
      "https://s1.example/page",
      "https://s2.example/page",
    ]);
    expect(cited.report).toContain("## TL;DR\n\nAnswer [1].");
    expect(cited.report).toContain("see sources [3].");
  });

  it("omits empty takeaways and caveats", () => {
    const markdown = assembleReport({ ...outline, takeaways: [], caveats: [] }, ["A", "B"]);
    expect(markdown).not.toContain("## Key takeaways");
    expect(markdown).not.toContain("## Caveats");
  });

  it("uses a placeholder with no citation when a failed section had no sources", () => {
    expect(sectionPlaceholder([])).toBe("*This section could not be written.*");
  });
});

describe("helpers", () => {
  it("cleans heading text", () => {
    expect(cleanHeading("### **Costs:**")).toBe("Costs");
    expect(cleanHeading("  A\n  heading ")).toBe("A heading");
  });

  it("reduces the source item to readable, capped plan context", () => {
    expect(
      itemPlanContext({
        title: "Title",
        summary: "## TL;DR\nShort.",
        fullContent: "<article><h2>Part</h2><p>Body <b>text</b>.</p><script>x()</script></article>",
      })
    ).toBe("Title\n\n## TL;DR\nShort.\n\n## Part\n\nBody text.");
    const long = itemPlanContext({ title: "T", fullContent: `<p>${"word ".repeat(5_000)}</p>` })!;
    expect(long.length).toBeLessThanOrEqual(RESEARCH_ITEM_CONTEXT_MAX_CHARS + 1);
    expect(long.endsWith("…")).toBe(true);
    expect(itemPlanContext({ title: "", summary: null, fullContent: null })).toBeUndefined();
  });
});

describe("limitTldr", () => {
  const sentence = (n: number, lead: string) =>
    `${lead} ${Array.from({ length: n - 1 }, (_, i) => `w${i}`).join(" ")} [1].`;

  it("keeps a short TL;DR unchanged, citation markers not counted", () => {
    const tldr = `${sentence(25, "One")} ${sentence(30, "Two")}`;
    expect(limitTldr(tldr)).toBe(tldr);
  });

  it("drops whole sentences past 60 words", () => {
    const tldr = `${sentence(30, "One")} ${sentence(25, "Two")} ${sentence(20, "Three")}`;
    expect(limitTldr(tldr)).toBe(`${sentence(30, "One")} ${sentence(25, "Two")}`);
  });

  it("cuts a single overlong sentence at the limit with an ellipsis", () => {
    const trimmed = limitTldr(sentence(90, "Long"));
    expect(trimmed.endsWith("…")).toBe(true);
    expect(trimmed.split(" ")).toHaveLength(MAX_TLDR_WORDS);
  });

  it("is applied on assembly", () => {
    const outline: ResearchOutline = {
      shape: "explainer",
      tldr: `${sentence(40, "One")} ${sentence(40, "Two")}`,
      takeaways: [],
      sections: [{ heading: "A", purpose: "", findings: [0], sourceIds: [], format: "prose" }],
      caveats: [],
    };
    expect(assembleReport(outline, ["Body"])).toBe(
      `## TL;DR\n\n${sentence(40, "One")}\n\n## A\n\nBody\n`
    );
  });
});

function outlineWith(count: number): ResearchOutline {
  return {
    shape: "comparison",
    tldr: "A two-sentence answer with a figure of 42 percent [1]. It holds for most phones [2].",
    takeaways: [
      "Apple ships a 3B-parameter on-device model since 2024 [1].",
      "Google's Gemini Nano runs on Pixel 8 and Galaxy S24 phones [2].",
      "Hybrid assistants send about 30 percent of requests to the cloud [3].",
    ],
    sections: Array.from({ length: count }, (_, index) => ({
      heading: `Section heading ${index + 1}`,
      purpose: "p",
      findings: [0],
      sourceIds: [1],
      format: "prose" as const,
    })),
    caveats: ["Benchmarks come from vendors [2].", "Figures may be out of date."],
  };
}

describe("sectionWordBudget", () => {
  it.each([2, 3, 4, 6])(
    "shares 2,500 words minus the frame among %i sections within the clamp",
    (count) => {
      const outline = outlineWith(count);
      const budget = sectionWordBudget(outline);
      const share = Math.floor((MAX_REPORT_WORDS - reportFrameWords(outline)) / count / 10) * 10;
      expect(budget.max).toBe(
        Math.min(MAX_SECTION_WORDS, Math.max(MIN_SECTION_BUDGET_WORDS, share))
      );
      expect(budget.min).toBeLessThan(budget.max);
      expect(budget.min).toBeGreaterThanOrEqual(150);
      expect(reportFrameWords(outline) + count * budget.max).toBeLessThanOrEqual(MAX_REPORT_WORDS);
    }
  );

  it("gives a six-section outline stored before the cap a smaller share", () => {
    expect(sectionWordBudget(outlineWith(6)).max).toBeLessThan(
      sectionWordBudget(outlineWith(4)).max
    );
    expect(sectionWordBudget(outlineWith(2)).max).toBe(MAX_SECTION_WORDS);
  });

  it.each([2, 3, 4])("puts the budget for %i sections into the section writer prompt", (count) => {
    const outline = outlineWith(count);
    const state: ResearchRunState = {
      version: 3,
      updatedAt: "2026-09-30T10:00:00.000Z",
      view: { stage: "writing", current: 1, total: count, heading: "Section heading 1" },
      subQuestions: ["Q1"],
      findings: [
        {
          question: "Q1",
          notes: "- Q1 fact.",
          sources: [{ url: "https://a.example/1", title: "A1" }],
          grounded: true,
        },
      ],
      gaps: [],
      deepening: [],
      outline,
      sections: outline.sections.map(() => null),
      attempts: {},
    };
    const { min, max } = sectionWordBudget(outline);
    const prompt = buildSectionPrompt("q", state, 0);
    expect(prompt).toContain(`about ${min}-${max} words, never more than ${max}`);
    expect(prompt).not.toContain("250-450");
  });
});

describe("capReportSections", () => {
  const paragraph = (lead: string, count = 100) => words(count, lead);
  const table = [
    "| Assistant | Latency |",
    "| --- | --- |",
    ...Array.from(
      { length: 30 },
      (_, index) => `| Model ${index} with long name | ${index} ms [2] |`
    ),
  ].join("\n");

  it("leaves a report within the cap unchanged", () => {
    const outline = outlineWith(2);
    const sections = [paragraph("One [1]"), paragraph("Two [2]")];
    const capped = capReportSections(outline, sections);
    expect(capped.sections).toEqual(sections);
    expect(capped.trimmed).toBe(0);
    expect(capped.wordsAfter).toBe(capped.wordsBefore);
  });

  it("trims the longest sections at paragraph boundaries to 2,500 words, keeping tables whole", () => {
    const outline = outlineWith(6);
    const sections = outline.sections.map((_, index) =>
      index === 1
        ? [paragraph("Intro to the table [2]", 30), table, paragraph("After the table", 200)].join(
            "\n\n"
          )
        : Array.from({ length: 6 }, (_, block) => paragraph(`S${index} B${block} [1]`)).join("\n\n")
    );
    const before = countSectionWords(assembleReport(outline, sections));
    expect(before).toBeGreaterThan(3_500);

    const capped = capReportSections(outline, sections);
    const report = assembleReport(outline, capped.sections);
    expect(capped.wordsBefore).toBe(before);
    expect(capped.wordsAfter).toBe(countSectionWords(report));
    expect(capped.wordsAfter).toBeLessThanOrEqual(MAX_REPORT_WORDS);
    expect(capped.trimmed).toBeGreaterThan(0);
    // The table survives whole; trimming removed the paragraph after it.
    expect(capped.sections[1]).toContain(table);
    expect(capped.sections[1]).not.toContain("After the table");
    // Whole blocks are dropped from the end: each section keeps a prefix of its paragraphs.
    capped.sections.forEach((body, index) => {
      expect(sections[index]!.startsWith(body)).toBe(true);
      expect(countSectionWords(body)).toBeGreaterThan(0);
    });
    // Every heading is still there.
    outline.sections.forEach((section) => expect(report).toContain(`## ${section.heading}\n\n`));
  });

  it("never splits a table or a list block and stops when nothing more can go", () => {
    const outline = outlineWith(1);
    const list = Array.from({ length: 40 }, (_, index) => `- Item ${index} ${words(20)}`).join(
      "\n"
    );
    const sections = [[paragraph("Lead", 20), table, list].join("\n\n")];
    const capped = capReportSections(outline, sections, 100);
    // The list goes as a whole block; the lead and the table stay.
    expect(capped.sections[0]).toBe([paragraph("Lead", 20), table].join("\n\n"));
    expect(capped.wordsAfter).toBeGreaterThan(100);
  });

  it("drops a ### subheading left dangling at the end of a section", () => {
    const outline = outlineWith(1);
    const sections = [
      [paragraph("First"), "### A subpoint", paragraph("Second", 400)].join("\n\n"),
    ];
    const capped = capReportSections(outline, sections, 300);
    expect(capped.sections[0]).toBe(paragraph("First"));
  });
});
