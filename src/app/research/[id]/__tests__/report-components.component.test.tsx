/**
 * @jest-environment jsdom
 */

import { renderWithContentCache as baseRender } from "../../../../../tests/support/content-cache";
import React from "react";
import { fireEvent, screen, within } from "@testing-library/react";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";
import type { Components, ExtraProps } from "react-markdown";

import {
  createCitationLink,
  createHeading,
  createReportComponents,
  ReportLink,
} from "@/components/research/report-body";
import {
  CITATION_LINK_TITLE,
  CITATION_REF_TITLE,
  extractHeadings,
} from "@/components/research/report-markdown";
import { ReportToc } from "@/components/research/report-toc";
import { ResearchReportView } from "@/components/research/research-report-view";
import { normalizeSources, splitSources } from "@/components/research/research-sources";
import {
  ResearchSourcesList,
  UNVERIFIED_SOURCES_NOTE,
} from "@/components/research/research-sources-list";

// react-markdown is ESM-only and is never loaded by the Jest harness; the mock records the
// markdown and components each call receives.
const markdownCalls: { children: string; components?: Components }[] = [];
jest.mock("@/components/markdown", () => ({
  Markdown: (props: { children: string; components?: Components }) => {
    markdownCalls.push(props);
    return <div data-testid="markdown">{props.children}</div>;
  },
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/research/r1",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const render = (ui: React.ReactElement) => baseRender(ui, { wrapper: ShortcutsProvider });

function nodeAt(line: number): ExtraProps["node"] {
  return { position: { start: { line } } } as unknown as ExtraProps["node"];
}

describe("report heading ids", () => {
  it("assigns the ids extracted for the same markdown, duplicates included", () => {
    const markdown = "## Overview\ntext\n## Overview\n### Detail";
    const headings = extractHeadings(markdown);
    const idsByLine = new Map(headings.map((heading) => [heading.line, heading.id]));
    const H2 = createHeading(2, idsByLine);
    const H3 = createHeading(3, idsByLine);
    render(
      <>
        <H2 node={nodeAt(1)}>Overview</H2>
        <H2 node={nodeAt(3)}>Overview</H2>
        <H3 node={nodeAt(4)}>Detail</H3>
      </>
    );
    const rendered = screen.getAllByRole("heading");
    expect(rendered.map((heading) => heading.id)).toEqual(["overview", "overview-2", "detail"]);
    expect(rendered[0].tagName).toBe("H2");
    expect(rendered[2].tagName).toBe("H3");
  });

  it("adds no id to a heading the table of contents does not list", () => {
    const H2 = createHeading(2, new Map());
    render(
      <H2 node={nodeAt(1)}>
        Market <strong>share</strong>
      </H2>
    );
    expect(screen.getByRole("heading", { name: "Market share" })).not.toHaveAttribute("id");
  });

  it("wires headings, links and tables through the components map", () => {
    const components = createReportComponents([]);
    expect(Object.keys(components).sort()).toEqual(["a", "h2", "h3", "h4", "table", "td", "th"]);
  });
});

describe("ReportLink", () => {
  it("renders a citation link as a compact domain chip", () => {
    render(
      <ReportLink href="https://www.example.com/deep/path" title={CITATION_LINK_TITLE}>
        A very long article title
      </ReportLink>
    );
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent(/^example\.com$/);
    expect(link).toHaveAttribute("href", "https://www.example.com/deep/path");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("data-citation-chip");
    expect(link).toHaveAccessibleName(
      "A very long article title (example.com), opens in a new tab"
    );
    expect(link.querySelector("svg")).not.toBeNull();
  });

  it("renders a bare autolink as a chip too", () => {
    render(<ReportLink href="https://a.example/x">https://a.example/x</ReportLink>);
    expect(screen.getByRole("link")).toHaveTextContent(/^a\.example$/);
  });

  it("keeps the text of links in running prose", () => {
    render(<ReportLink href="https://a.example/x">the handbook</ReportLink>);
    const link = screen.getByRole("link", { name: "the handbook" });
    expect(link).not.toHaveAttribute("data-citation-chip");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("leaves in-page links in the same tab", () => {
    render(<ReportLink href="#analysis">Analysis</ReportLink>);
    expect(screen.getByRole("link", { name: "Analysis" })).not.toHaveAttribute("target");
  });
});

describe("ReportToc", () => {
  const headings = extractHeadings("## Findings\n### Detail\n## Findings\n## Outlook");

  it("lists ## and ### headings, the TL;DR first, as in-page links", () => {
    render(<ReportToc headings={headings} hasSummary variant="rail" />);
    const nav = screen.getByRole("navigation", { name: "On this page" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["TL;DR", "#tldr"],
      ["Findings", "#findings"],
      ["Detail", "#detail"],
      ["Findings", "#findings-2"],
      ["Outlook", "#outlook"],
    ]);
  });

  it("collapses on phones and closes after choosing an entry", () => {
    const { container } = render(
      <ReportToc headings={headings} hasSummary={false} variant="collapsible" />
    );
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(screen.getByText(/4 parts/)).toBeInTheDocument();
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(details.open).toBe(true);
    fireEvent.click(screen.getByRole("link", { name: "Outlook" }));
    expect(details.open).toBe(false);
  });

  it("renders nothing for a report with fewer than two entries", () => {
    const { container } = render(
      <ReportToc headings={extractHeadings("## Only")} hasSummary={false} variant="rail" />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ResearchSourcesList", () => {
  it("shows cited sources first and the rest behind a second disclosure, all collapsed", () => {
    const sources = normalizeSources([
      "https://ieeexplore.ieee.org/",
      "https://www.example.com/guides/branching",
      "https://unrelated.example/2019/story",
    ]);
    const { cited, other } = splitSources(sources, "A [x](https://example.com/guides/branching).");
    const { container } = render(<ResearchSourcesList cited={cited} other={other} />);

    const disclosures = container.querySelectorAll("details");
    expect(disclosures).toHaveLength(2);
    disclosures.forEach((details) => expect(details.open).toBe(false));
    expect(screen.getByText("Cited in this report (1)")).toBeInTheDocument();
    expect(screen.getByText("Other links the research touched (2)")).toBeInTheDocument();
    expect(screen.getByText(/1 cited, 2 more/)).toBeInTheDocument();

    const citedLink = screen.getByRole("link", {
      name: /example\.com \/guides\/branching/,
      hidden: true,
    });
    expect(citedLink).toHaveAttribute("href", "https://www.example.com/guides/branching");
    expect(citedLink).toHaveAttribute("target", "_blank");
    expect(citedLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(
      screen.getByRole("link", { name: /ieeexplore\.ieee\.org/, hidden: true })
    ).toBeInTheDocument();
  });

  it("numbers titled source objects and shows title and domain", () => {
    const sources = normalizeSources([
      {
        id: 1,
        url: "https://a.example/post",
        title: "A post",
        domain: "a.example",
        grounded: true,
      },
    ]);
    const { cited, other } = splitSources(sources, "Claim [1].");
    render(<ResearchSourcesList cited={cited} other={other} />);
    expect(screen.getByText("1.")).toBeInTheDocument();
    expect(screen.getByText("A post")).toBeInTheDocument();
    expect(screen.getByText("a.example")).toBeInTheDocument();
    expect(screen.queryByText(/Other links/)).not.toBeInTheDocument();
  });

  it("lists everything plainly when nothing is cited, and nothing when empty", () => {
    const sources = normalizeSources(["https://a.example", "https://b.example"]);
    const { container, rerender } = render(<ResearchSourcesList cited={[]} other={sources} />);
    expect(screen.getByText("Links the research touched (2)")).toBeInTheDocument();
    expect(container.querySelectorAll("details")).toHaveLength(1);
    rerender(<ResearchSourcesList cited={[]} other={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ResearchReportView", () => {
  beforeEach(() => {
    markdownCalls.length = 0;
  });

  const legacyReport = {
    query: "How do small teams ship safely?",
    report: [
      "# Research Report: How do small teams ship safely?",
      "",
      "## Executive Summary",
      "Short branches and fast checks.",
      "",
      "---",
      "",
      "## Key Findings",
      "### Branching",
      "- Short branches ([Guide](https://www.example.com/guides/branching))",
      "## Key Findings",
      "## Conclusion",
      "Keep it small.",
    ].join("\n"),
    sources: [
      "https://www.example.com/guides/branching",
      "https://other.example/",
      "https://third.example/a",
    ],
    itemId: "item-1",
    createdAt: "2026-09-21T10:00:00.000Z",
    completedAt: "2026-09-21T10:05:00.000Z",
  };

  it("renders the header stats, TL;DR, cleaned body with heading ids, TOC and sources", async () => {
    render(<ResearchReportView report={legacyReport} />);
    await screen.findAllByTestId("markdown");

    expect(screen.getByRole("heading", { level: 1, name: legacyReport.query })).toBeInTheDocument();
    expect(screen.getByTestId("report-stats")).toHaveTextContent(
      "3 sections · ~1 min read · 1 source"
    );
    expect(screen.getByText(/^Completed /)).toBeInTheDocument();

    const tldr = screen.getByRole("region", { name: "TL;DR" });
    expect(tldr).toHaveAttribute("id", "tldr");
    expect(tldr).toHaveTextContent("Short branches and fast checks.");

    // Summary first, then the body; the body has no duplicate title, summary or rules.
    expect(markdownCalls).toHaveLength(2);
    const body = markdownCalls[1].children;
    expect(body).not.toContain("Research Report:");
    expect(body).not.toContain("Executive Summary");
    expect(body).not.toMatch(/^---$/m);
    expect(body).toContain(CITATION_LINK_TITLE);
    expect(markdownCalls[1].components?.h2).toBeDefined();
    expect(markdownCalls[1].components?.a).toBe(ReportLink);

    // Both TOC variants render with de-duplicated ids.
    const navs = screen.getAllByRole("navigation", { name: "On this page" });
    expect(navs).toHaveLength(2);
    expect(
      within(navs[1])
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"))
    ).toEqual(["#tldr", "#key-findings", "#branching", "#key-findings-2", "#conclusion"]);

    expect(screen.getByText("Cited in this report (1)")).toBeInTheDocument();
    expect(screen.getByText("Other links the research touched (2)")).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Report actions" })).toBeInTheDocument();
  });

  it("renders a report without a summary heading, headings or sources", async () => {
    render(
      <ResearchReportView
        report={{
          query: "Q",
          report: "Plain answer without structure.",
          sources: [],
          createdAt: "2026-09-21T10:00:00.000Z",
          completedAt: null,
        }}
      />
    );
    await screen.findByTestId("markdown");
    expect(screen.queryByRole("region", { name: "TL;DR" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sources" })).not.toBeInTheDocument();
    expect(screen.getByTestId("report-stats")).toHaveTextContent(/^~1 min read$/);
    expect(screen.queryByText(/Completed/)).not.toBeInTheDocument();
    expect(markdownCalls.map((call) => call.children)).toEqual(["Plain answer without structure."]);
  });

  it("accepts R2 source objects", async () => {
    render(
      <ResearchReportView
        report={{
          query: "Q",
          report: "## Answer\nA grounded claim [1].\n## More\nText.",
          sources: [
            {
              id: 1,
              url: "https://a.example/post",
              title: "A post",
              domain: "a.example",
              grounded: true,
            },
          ],
          createdAt: "2026-09-21T10:00:00.000Z",
        }}
      />
    );
    await screen.findByTestId("markdown");
    expect(screen.getByTestId("report-stats")).toHaveTextContent(
      "2 sections · ~1 min read · 1 source"
    );
    expect(screen.getByText("Sources (1)")).toBeInTheDocument();
    expect(screen.queryByText(/Cited in this report/)).not.toBeInTheDocument();
    expect(screen.getByText("A post")).toBeInTheDocument();
    expect(screen.queryByTestId("unverified-sources-note")).not.toBeInTheDocument();
  });

  it("treats an empty sources array like a report without sources", async () => {
    render(
      <ResearchReportView
        report={{
          query: "Q",
          report: "Claim [1].",
          sources: [],
          createdAt: "2026-09-30T10:00:00.000Z",
        }}
      />
    );
    await screen.findByTestId("markdown");
    expect(markdownCalls.at(-1)?.children).toBe("Claim [1].");
    expect(markdownCalls.at(-1)?.components?.a).toBe(ReportLink);
    expect(screen.queryByRole("region", { name: "Sources" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("unverified-sources-note")).not.toBeInTheDocument();
  });

  it("keeps legacy string[] reports on R1's behaviour, markers untouched", async () => {
    render(
      <ResearchReportView
        report={{ ...legacyReport, report: `${legacyReport.report}\nSee [1].` }}
      />
    );
    await screen.findAllByTestId("markdown");
    const body = markdownCalls.at(-1)!;
    expect(body.children).toContain("See [1].");
    expect(body.children).not.toContain(CITATION_REF_TITLE);
    expect(body.components?.a).toBe(ReportLink);
    expect(screen.getByText("Other links the research touched (2)")).toBeInTheDocument();
    expect(screen.queryByTestId("unverified-sources-note")).not.toBeInTheDocument();
  });
});

describe("numbered citations (R2)", () => {
  const sources = normalizeSources([
    {
      id: 1,
      url: "https://www.who.int/r",
      title: "WHO report",
      domain: "who.int",
      grounded: false,
    },
    { id: 2, url: "https://nih.gov/a", title: "nih.gov", domain: "nih.gov", grounded: false },
  ]);
  const CitationLink = createCitationLink(new Map(sources.map((source) => [source.id, source])));

  it("renders a marker group as one superscript of source links with tooltips", () => {
    const { container } = render(
      <p>
        Claim
        <CitationLink href="#source-1" title={CITATION_REF_TITLE}>
          1,2
        </CitationLink>
      </p>
    );
    const group = container.querySelector("sup[data-citation-group]");
    expect(group).not.toBeNull();
    const links = within(group as HTMLElement).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["#source-1", "#source-2"]);
    expect(links[0]).toHaveAttribute("title", "WHO report — who.int");
    expect(links[0]).toHaveAccessibleName("Source 1: WHO report — who.int");
    expect(links[1]).toHaveAttribute("title", "nih.gov");
    expect(links[0]).not.toHaveAttribute("target");
    expect(group).toHaveTextContent("1,2");
  });

  it("renders unknown ids as plain text and other links as ReportLink", () => {
    const { container } = render(
      <p>
        <CitationLink href="#source-9" title={CITATION_REF_TITLE}>
          9,8
        </CitationLink>{" "}
        <CitationLink href="https://x.example/a" title={CITATION_LINK_TITLE}>
          x
        </CitationLink>
      </p>
    );
    expect(container.querySelector("sup")).toBeNull();
    expect(container).toHaveTextContent("[9][8]");
    expect(container.querySelector("[data-citation-chip]")).not.toBeNull();
  });

  it("opens the collapsed sources list when a citation is clicked", () => {
    const { container } = render(
      <>
        <CitationLink href="#source-2" title={CITATION_REF_TITLE}>
          2
        </CitationLink>
        <ResearchSourcesList cited={sources} other={[]} numbered />
      </>
    );
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByRole("link", { name: /^Source 2/ }));
    expect(details.open).toBe(true);
  });

  it("lists numbered sources with anchors and the unverified note when nothing is grounded", () => {
    const { container, rerender } = render(
      <ResearchSourcesList cited={[...sources].reverse()} other={[]} numbered />
    );
    expect(screen.getByText("Sources (2)")).toBeInTheDocument();
    const rows = container.querySelectorAll("li");
    expect([...rows].map((row) => row.id)).toEqual(["source-1", "source-2"]);
    expect(rows[0]).toHaveClass("scroll-mt-20");
    expect(within(rows[0] as HTMLElement).getByRole("link")).toHaveAttribute(
      "href",
      "https://www.who.int/r"
    );
    expect(screen.getByTestId("unverified-sources-note")).toHaveTextContent(
      UNVERIFIED_SOURCES_NOTE
    );
    expect(screen.queryByText(/Other links/)).not.toBeInTheDocument();

    rerender(
      <ResearchSourcesList
        cited={[{ ...sources[0], grounded: true }, sources[1]]}
        other={[]}
        numbered
      />
    );
    expect(screen.queryByTestId("unverified-sources-note")).not.toBeInTheDocument();
    rerender(<ResearchSourcesList cited={[]} other={[]} numbered />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("stored R2 report fixture", () => {
  beforeEach(() => {
    markdownCalls.length = 0;
  });

  // Shaped exactly as the engine stores a completed report: markdown with renumbered [n]
  // markers and the cited-only source objects (JSON in research_reports.sources).
  const storedReport = {
    query: "What are the main approaches to on-device AI assistants?",
    report: [
      "# Research Report: On-device assistants",
      "",
      "## Executive Summary",
      "Phones run small models locally [1] and hand off hard tasks [2][3].",
      "",
      "## Key Findings",
      "### Model size",
      "- 3B-parameter models run at interactive speed [1].",
      "- Unknown marker [7] stays text; code `x[1]` stays code.",
      "## Conclusion",
      "Hybrid designs dominate [3, 1].",
    ].join("\n"),
    sources: JSON.parse(
      JSON.stringify([
        {
          id: 1,
          url: "https://a.example/on-device",
          title: "On-device models",
          domain: "a.example",
          grounded: false,
        },
        {
          id: 2,
          url: "https://b.example/cloud",
          title: "Cloud handoff",
          domain: "b.example",
          grounded: false,
        },
        {
          id: 3,
          url: "https://c.example/hybrid",
          title: "c.example",
          domain: "c.example",
          grounded: false,
        },
      ])
    ) as unknown,
    createdAt: "2026-09-30T10:00:00.000Z",
    completedAt: "2026-09-30T10:04:00.000Z",
  };

  it("renders citations, numbered anchored sources, header count and the unverified note", async () => {
    const { container } = render(<ResearchReportView report={storedReport} />);
    await screen.findAllByTestId("markdown");

    expect(screen.getByTestId("report-stats")).toHaveTextContent(
      "2 sections · ~1 min read · 3 sources"
    );
    expect(markdownCalls).toHaveLength(2);
    const [summary, body] = markdownCalls;
    expect(summary.children).toBe(
      `Phones run small models locally [1](#source-1 "${CITATION_REF_TITLE}") and hand off hard tasks [2,3](#source-2 "${CITATION_REF_TITLE}").`
    );
    expect(body.children).toContain(`interactive speed [1](#source-1 "${CITATION_REF_TITLE}").`);
    expect(body.children).toContain("Unknown marker [7] stays text; code `x[1]` stays code.");
    expect(body.children).toContain(`dominate [3,1](#source-3 "${CITATION_REF_TITLE}").`);

    // The body's link component resolves the group against the stored sources.
    const Link = body.components!.a as React.ComponentType<Record<string, unknown>>;
    render(
      <Link href="#source-3" title={CITATION_REF_TITLE}>
        3,1
      </Link>
    );
    expect(screen.getByRole("link", { name: "Source 3: Hybrid — c.example" })).toHaveAttribute(
      "href",
      "#source-3"
    );
    expect(
      screen.getByRole("link", { name: "Source 1: On-device models — a.example" })
    ).toBeVisible();

    const rows = container.querySelectorAll("section[aria-label='Sources'] li");
    expect([...rows].map((row) => row.id)).toEqual(["source-1", "source-2", "source-3"]);
    expect(screen.getByText("Sources (3)")).toBeInTheDocument();
    expect(screen.getByTestId("unverified-sources-note")).toHaveTextContent(
      "Sources recalled by the model, not verified by search"
    );
  });
});

describe("stored R3 report fixture", () => {
  beforeEach(() => {
    markdownCalls.length = 0;
  });

  // Shaped as the R3 engine assembles it: TL;DR, key takeaways, question-specific sections
  // (one a GFM table, one a failed-section placeholder), caveats; cited-only renumbered sources.
  const storedReport = {
    query: "Which on-device assistant approach should a phone maker pick?",
    report: [
      "## TL;DR",
      "",
      "Hybrid designs win on latency and privacy [1][2].",
      "",
      "## Key takeaways",
      "",
      "- A 3B model answers in 120 ms [1].",
      "- Cloud handoff costs 0.4 s per request [2].",
      "",
      "## How on-device models work",
      "",
      "Small models run locally [1].",
      "",
      "### Memory limits",
      "",
      "Eight gigabytes is the floor [1].",
      "",
      "## The approaches side by side",
      "",
      "| Approach | Latency |",
      "| --- | --- |",
      "| On-device | 120 ms [1] |",
      "| Cloud | 400 ms [2] |",
      "",
      "## What to watch",
      "",
      "*This section could not be written; see sources [2].*",
      "",
      "## Caveats and open questions",
      "",
      "- Figures are vendor-reported [2].",
      "",
    ].join("\n"),
    sources: [
      {
        id: 1,
        url: "https://a.example/1",
        title: "Model card",
        domain: "a.example",
        grounded: true,
      },
      {
        id: 2,
        url: "https://b.example/2",
        title: "Latency study",
        domain: "b.example",
        grounded: true,
      },
    ] as unknown,
    createdAt: "2026-09-30T10:00:00.000Z",
    completedAt: "2026-09-30T10:06:00.000Z",
  };

  it("lifts the TL;DR into the callout and lists every section in the contents", async () => {
    render(<ResearchReportView report={storedReport} />);
    await screen.findAllByTestId("markdown");

    const tldr = screen.getByRole("region", { name: "TL;DR" });
    expect(tldr).toHaveAttribute("id", "tldr");
    expect(markdownCalls[0].children).toBe(
      `Hybrid designs win on latency and privacy [1,2](#source-1 "${CITATION_REF_TITLE}").`
    );
    const body = markdownCalls[1].children;
    expect(body).not.toContain("## TL;DR");
    expect(body.startsWith("## Key takeaways")).toBe(true);
    expect(body).toContain(`| On-device | 120 ms [1](#source-1 "${CITATION_REF_TITLE}") |`);
    expect(body).toContain("*This section could not be written; see sources [2](#source-2");

    const navs = screen.getAllByRole("navigation", { name: "On this page" });
    expect(
      within(navs[1])
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")])
    ).toEqual([
      ["TL;DR", "#tldr"],
      ["Key takeaways", "#key-takeaways"],
      ["How on-device models work", "#how-on-device-models-work"],
      ["Memory limits", "#memory-limits"],
      ["The approaches side by side", "#the-approaches-side-by-side"],
      ["What to watch", "#what-to-watch"],
      ["Caveats and open questions", "#caveats-and-open-questions"],
    ]);
    // Key takeaways and Caveats are framing: the header counts the three body sections.
    expect(screen.getByTestId("report-stats")).toHaveTextContent("3 sections");
    expect(screen.getByTestId("report-stats")).toHaveTextContent("2 sources");
    expect(screen.getByText("Sources (2)")).toBeInTheDocument();
    expect(screen.queryByTestId("unverified-sources-note")).not.toBeInTheDocument();
  });
});
