/**
 * @jest-environment jsdom
 */

import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Components, ExtraProps } from "react-markdown";

import {
  createHeading,
  createReportComponents,
  ReportLink,
} from "@/components/research/report-body";
import { CITATION_LINK_TITLE, extractHeadings } from "@/components/research/report-markdown";
import { ReportToc } from "@/components/research/report-toc";
import { ResearchReportView } from "@/components/research/research-report-view";
import { normalizeSources, splitSources } from "@/components/research/research-sources";
import { ResearchSourcesList } from "@/components/research/research-sources-list";

// react-markdown is ESM-only and is never loaded by the Jest harness; the mock records the
// markdown and components each call receives.
const markdownCalls: { children: string; components?: Components }[] = [];
jest.mock("@/components/markdown", () => ({
  Markdown: (props: { children: string; components?: Components }) => {
    markdownCalls.push(props);
    return <div data-testid="markdown">{props.children}</div>;
  },
}));

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

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
    expect(screen.getByText("Cited in this report (1)")).toBeInTheDocument();
    expect(screen.getByText("A post")).toBeInTheDocument();
  });
});
