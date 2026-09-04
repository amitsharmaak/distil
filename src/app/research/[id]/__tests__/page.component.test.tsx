/**
 * @jest-environment jsdom
 */

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import ResearchPage from "../page";

const mockUseParams = jest.fn();

jest.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("@/lib/config", () => ({
  config: { apiBaseUrl: "https://distil.test" },
}));

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("@/components/feed/deep-research", () => ({
  DeepResearch: ({
    children,
    defaultQuery,
    itemId,
  }: {
    children: React.ReactNode;
    defaultQuery: string;
    itemId?: string;
  }) => (
    <div data-testid="deep-research" data-query={defaultQuery} data-item-id={itemId}>
      {children}
    </div>
  ),
}));

interface ReportOverrides {
  id?: string;
  item_id?: string | null;
  query?: string;
  report?: string;
  sources?: string[];
  model?: string;
  status?: string;
  created_at?: string;
  completed_at?: string | null;
  progress?: string | Record<string, unknown> | null;
}

function makeReport(overrides: ReportOverrides = {}) {
  return {
    id: "research-1",
    item_id: "item-1",
    query: "What changed?",
    report: "Research body",
    sources: [],
    model: "test-model",
    status: "completed",
    created_at: "2026-01-02T03:04:05.000Z",
    completed_at: "2026-01-02T04:05:06.000Z",
    progress: null,
    ...overrides,
  };
}

function responseFor(report: ReturnType<typeof makeReport>, ok = true): Response {
  return {
    ok,
    json: jest.fn().mockResolvedValue({ report }),
  } as unknown as Response;
}

type EventHandler = (event: MessageEvent<string>) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly url: string;
  readonly close = jest.fn();
  private readonly listeners = new Map<string, EventHandler[]>();

  constructor(url: string | URL) {
    this.url = String(url);
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const handler = listener as EventHandler;
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
  }

  emit(type: string, data = ""): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data }));
    }
  }
}

const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
const writeTextMock = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);

describe("ResearchPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    writeTextMock.mockReset().mockResolvedValue(undefined);
    MockEventSource.instances = [];
    mockUseParams.mockReturnValue({ id: "research-1" });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
    Object.defineProperty(globalThis, "EventSource", {
      configurable: true,
      writable: true,
      value: MockEventSource,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows the loading shell while the initial report request is pending", () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));

    const { container } = render(<ResearchPage />);

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledWith("https://distil.test/api/ai/research/research-1");
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("does not fetch when the route has no research id", () => {
    mockUseParams.mockReturnValue({});

    render(<ResearchPage />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("renders the request error and a route back to the feed", async () => {
    fetchMock.mockResolvedValue(responseFor(makeReport(), false));

    render(<ResearchPage />);

    expect(await screen.findByRole("heading", { name: "Error" })).toBeInTheDocument();
    expect(screen.getByText("Report not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to feed" })).toHaveAttribute("href", "/feed");
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("uses the generic error message for a non-Error rejection", async () => {
    fetchMock.mockRejectedValue("offline");

    render(<ResearchPage />);

    expect(await screen.findByText("Failed to load report")).toBeInTheDocument();
  });

  it("renders a completed report, extracts its summary, sources, and item backlink", async () => {
    const report = makeReport({
      report: "## Executive Summary\nA concise answer.\n\n## Findings\nDetailed evidence.",
      sources: ["https://example.test/source", "https://example.test/second"],
    });
    fetchMock.mockResolvedValue(responseFor(report));

    render(<ResearchPage />);

    expect(await screen.findByRole("heading", { name: report.query })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/feed/item-1");
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText(/Completed/)).toBeInTheDocument();
    const markdown = screen.getAllByTestId("markdown");
    expect(markdown).toHaveLength(2);
    expect(markdown[0]).toHaveTextContent("A concise answer.");
    expect(markdown[1]).toHaveTextContent("## Findings Detailed evidence.");
    expect(markdown[1]).not.toHaveTextContent("Executive Summary");
    expect(screen.getByText("Sources (2)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /example\.test\/source/ })).toHaveAttribute(
      "rel",
      "noopener noreferrer"
    );
    expect(screen.getByTestId("deep-research")).toHaveAttribute("data-query", report.query);
    expect(screen.getByTestId("deep-research")).toHaveAttribute("data-item-id", "item-1");
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("supports summary headings, reports without summaries, and research without an item", async () => {
    fetchMock.mockResolvedValue(
      responseFor(
        makeReport({
          item_id: null,
          completed_at: null,
          report: "# Executive Summary\nTop line only.",
        })
      )
    );

    const { unmount } = render(<ResearchPage />);

    expect(await screen.findByText("Top line only.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/research");
    expect(screen.getByTestId("deep-research")).not.toHaveAttribute("data-item-id");
    expect(screen.queryByText(/Completed/)).not.toBeInTheDocument();

    unmount();
    fetchMock.mockResolvedValue(responseFor(makeReport({ report: "No summary here." })));
    render(<ResearchPage />);

    expect(await screen.findByText("No summary here.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Executive Summary" })).not.toBeInTheDocument();
  });

  it("copies the complete markdown and restores the button label after two seconds", async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue(responseFor(makeReport({ report: "Markdown to copy" })));
    render(<ResearchPage />);
    const copyButton = await screen.findByRole("button", { name: /Copy as Markdown/ });

    await act(async () => {
      fireEvent.click(copyButton);
      await Promise.resolve();
    });

    expect(writeTextMock).toHaveBeenCalledWith("Markdown to copy");
    expect(screen.getByRole("button", { name: /Copied!/ })).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(2000));
    expect(screen.getByRole("button", { name: /Copy as Markdown/ })).toBeInTheDocument();
  });

  it("renders a failed report without opening a stream", async () => {
    fetchMock.mockResolvedValue(
      responseFor(makeReport({ status: "failed", report: "Provider failed" }))
    );

    render(<ResearchPage />);

    expect(await screen.findByText("Provider failed")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("uses the fallback message for a failed report without details", async () => {
    fetchMock.mockResolvedValue(responseFor(makeReport({ status: "failed", report: "" })));

    render(<ResearchPage />);

    expect(await screen.findByText("Research failed. Please try again.")).toBeInTheDocument();
  });

  it("opens one stream for an active report and applies valid progress and status events", async () => {
    fetchMock.mockResolvedValue(
      responseFor(
        makeReport({
          status: "running",
          progress: JSON.stringify({
            stage: "researching",
            current: 2,
            total: 4,
            question: "Why?",
          }),
        })
      )
    );

    render(<ResearchPage />);

    expect(await screen.findByText("Research in progress")).toBeInTheDocument();
    expect(screen.getByText("Researching (2/4): Why?")).toBeInTheDocument();
    expect(MockEventSource.instances).toHaveLength(1);
    const stream = MockEventSource.instances[0];
    expect(stream.url).toBe("https://distil.test/api/ai/research/research-1/stream");

    act(() => {
      stream.emit("progress", JSON.stringify({ stage: "synthesizing" }));
      stream.emit("status", JSON.stringify({ status: "synthesizing" }));
    });

    expect(screen.getByText("synthesizing")).toBeInTheDocument();
    expect(screen.getByText("Synthesizing findings...")).toBeInTheDocument();
  });

  it("ignores malformed initial progress and malformed stream messages", async () => {
    fetchMock.mockResolvedValue(
      responseFor(makeReport({ status: "pending", progress: "not-json" }))
    );

    render(<ResearchPage />);

    expect(await screen.findByText("Planning research questions...")).toBeInTheDocument();
    const stream = MockEventSource.instances[0];
    act(() => {
      stream.emit("progress", "not-json");
      stream.emit("status", "not-json");
    });

    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText("Planning research questions...")).toBeInTheDocument();
  });

  it("accepts object progress and displays zero defaults for an incomplete research event", async () => {
    fetchMock.mockResolvedValue(
      responseFor(makeReport({ status: "researching", progress: { stage: "researching" } }))
    );

    render(<ResearchPage />);

    expect(await screen.findByText("Researching (0/1)")).toBeInTheDocument();
  });

  it("closes and refreshes the report when the stream completes", async () => {
    fetchMock
      .mockResolvedValueOnce(responseFor(makeReport({ status: "running" })))
      .mockResolvedValueOnce(
        responseFor(makeReport({ status: "completed", report: "Final report" }))
      );

    render(<ResearchPage />);
    expect(await screen.findByText("Research in progress")).toBeInTheDocument();
    const stream = MockEventSource.instances[0];

    await act(async () => {
      stream.emit("complete");
      await Promise.resolve();
    });

    expect(stream.close).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Final report")).toBeInTheDocument();
  });

  it("closes the stream on an SSE error and during unmount cleanup", async () => {
    fetchMock.mockResolvedValue(responseFor(makeReport({ status: "running" })));
    const { unmount } = render(<ResearchPage />);
    await screen.findByText("Research in progress");
    const stream = MockEventSource.instances[0];

    act(() => stream.emit("error"));
    expect(stream.close).toHaveBeenCalledTimes(1);

    unmount();
    await waitFor(() => expect(stream.close).toHaveBeenCalledTimes(2));
  });

  it("does not update state or create a stream when the initial request settles after unmount", async () => {
    let resolveRequest!: (response: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      })
    );
    const { unmount } = render(<ResearchPage />);

    unmount();
    await act(async () => {
      resolveRequest(responseFor(makeReport({ status: "running" })));
      await Promise.resolve();
    });

    expect(MockEventSource.instances).toHaveLength(0);
  });
});
