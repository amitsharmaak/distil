/**
 * @jest-environment jsdom
 */

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import ResearchPage from "../page";
import { ShortcutsProvider as ShortcutContextProvider } from "@/components/shortcuts/shortcuts-provider";
import { ContentCacheProvider } from "@/lib/client-cache/content-cache";

const mockUseParams = jest.fn();
const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
  usePathname: () => "/research/research-1",
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("@/lib/public-config", () => ({ apiBaseUrl: "https://distil.test" }));

// The page loads the markdown renderer lazily via next/dynamic; mock the
// module it resolves so the tests do not pull in react-markdown.
jest.mock("@/components/markdown", () => ({
  Markdown: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
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
  itemId?: string | null;
  query?: string;
  report?: string;
  sources?: unknown[];
  model?: string;
  status?: string;
  createdAt?: string;
  completedAt?: string | null;
  progress?: string | Record<string, unknown> | null;
}

function makeReport(overrides: ReportOverrides = {}) {
  return {
    id: "research-1",
    itemId: "item-1",
    query: "What changed?",
    report: "Research body",
    sources: [] as unknown[],
    model: "test-model",
    status: "completed",
    createdAt: "2026-01-02T03:04:05.000Z",
    completedAt: "2026-01-02T04:05:06.000Z",
    progress: null,
    ...overrides,
  };
}

function responseFor(report: ReturnType<typeof makeReport>, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
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
let accountNumber = 0;
let accountKey = "test-account-0";

function ShortcutsProvider({ children }: { children: React.ReactNode }) {
  return (
    <ContentCacheProvider accountKey={accountKey}>
      <ShortcutContextProvider>{children}</ShortcutContextProvider>
    </ContentCacheProvider>
  );
}

describe("ResearchPage", () => {
  beforeEach(() => {
    accountKey = `test-account-${++accountNumber}`;
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
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows the loading shell while the initial report request is pending", () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));

    const { container } = render(<ResearchPage />, { wrapper: ShortcutsProvider });

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://distil.test/api/ai/research/research-1",
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("does not fetch when the route has no research id", () => {
    mockUseParams.mockReturnValue({});

    render(<ResearchPage />, { wrapper: ShortcutsProvider });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("renders the request error and a route back to the feed", async () => {
    fetchMock.mockResolvedValue(responseFor(makeReport(), false));

    render(<ResearchPage />, { wrapper: ShortcutsProvider });

    expect(await screen.findByRole("heading", { name: "Error" })).toBeInTheDocument();
    expect(screen.getByText("Unable to refresh (404)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to feed" })).toHaveAttribute("href", "/feed");
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("uses the generic error message for a non-Error rejection", async () => {
    fetchMock.mockRejectedValue("offline");

    render(<ResearchPage />, { wrapper: ShortcutsProvider });

    expect(await screen.findByText("Failed to load report")).toBeInTheDocument();
  });

  it("renders a completed report as a readable page with summary, sources and item backlink", async () => {
    const report = makeReport({
      report:
        "# Research Report: What changed?\n\n## Executive Summary\nA concise answer.\n\n---\n\n## Findings\nDetailed evidence ([Source](https://example.test/source)).",
      sources: ["https://example.test/source", "https://example.test/second"],
    });
    fetchMock.mockResolvedValue(responseFor(report));

    render(<ResearchPage />, { wrapper: ShortcutsProvider });

    expect(
      await screen.findByRole("heading", { level: 1, name: report.query })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/feed/item-1");
    expect(screen.getByText(/Completed/)).toBeInTheDocument();
    expect(screen.getByTestId("report-stats")).toHaveTextContent(
      "1 section · ~1 min read · 1 source"
    );
    const markdown = await screen.findAllByTestId("markdown");
    expect(markdown).toHaveLength(2);
    expect(markdown[0]).toHaveTextContent("A concise answer.");
    expect(markdown[1]).toHaveTextContent("## Findings Detailed evidence");
    expect(markdown[1]).not.toHaveTextContent("Executive Summary");
    expect(markdown[1]).not.toHaveTextContent("Research Report");
    expect(screen.getByText("Cited in this report (1)")).toBeInTheDocument();
    expect(screen.getByText("Other links the research touched (1)")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /example\.test \/source/, hidden: true })
    ).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByTestId("deep-research")).toHaveAttribute("data-query", report.query);
    expect(screen.getByTestId("deep-research")).toHaveAttribute("data-item-id", "item-1");
    expect(screen.getByRole("button", { name: /Research further/ })).toBeInTheDocument();
    expect(screen.queryByText("completed")).not.toBeInTheDocument();
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("reuses a fresh completed report when the route remounts", async () => {
    fetchMock.mockResolvedValue(responseFor(makeReport({ report: "Cached detail" })));
    const view = render(
      <ShortcutsProvider>
        <ResearchPage />
      </ShortcutsProvider>
    );
    expect(await screen.findByText("Cached detail")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    view.rerender(
      <ShortcutsProvider>
        <div>Elsewhere</div>
      </ShortcutsProvider>
    );
    view.rerender(
      <ShortcutsProvider>
        <ResearchPage />
      </ShortcutsProvider>
    );

    expect(await screen.findByText("Cached detail")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("supports summary headings, reports without summaries, and research without an item", async () => {
    fetchMock.mockResolvedValue(
      responseFor(
        makeReport({
          itemId: null,
          completedAt: null,
          report: "# Executive Summary\nTop line only.",
        })
      )
    );

    const { unmount } = render(<ResearchPage />, { wrapper: ShortcutsProvider });

    expect(await screen.findByText("Top line only.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "TL;DR" })).toHaveTextContent("Top line only.");
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/research");
    expect(screen.getByTestId("deep-research")).not.toHaveAttribute("data-item-id");
    expect(screen.queryByText(/Completed/)).not.toBeInTheDocument();

    unmount();
    fetchMock.mockResolvedValue(responseFor(makeReport({ report: "No summary here." })));
    render(<ResearchPage />, { wrapper: ShortcutsProvider });

    expect(await screen.findByText("No summary here.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "TL;DR" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sources" })).not.toBeInTheDocument();
  });

  it("renders R2 source objects stored in the same column", async () => {
    fetchMock.mockResolvedValue(
      responseFor(
        makeReport({
          report: "## Answer\nA claim [1].",
          sources: [
            {
              id: 1,
              url: "https://a.test/post",
              title: "A post",
              domain: "a.test",
              grounded: true,
            },
          ],
        })
      )
    );

    render(<ResearchPage />, { wrapper: ShortcutsProvider });

    expect(await screen.findByText("Sources (1)")).toBeInTheDocument();
    expect(screen.getByText("A post")).toBeInTheDocument();
  });

  it("copies the complete markdown and restores the button label after two seconds", async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue(responseFor(makeReport({ report: "Markdown to copy" })));
    render(<ResearchPage />, { wrapper: ShortcutsProvider });
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

  it("Shift+C copies the markdown", async () => {
    fetchMock.mockResolvedValue(responseFor(makeReport({ report: "Markdown to copy" })));
    render(<ResearchPage />, { wrapper: ShortcutsProvider });
    await screen.findByRole("button", { name: /Copy as Markdown/ });

    await act(async () => {
      fireEvent.keyDown(document.body, { key: "C", shiftKey: true });
      await Promise.resolve();
    });

    expect(writeTextMock).toHaveBeenCalledWith("Markdown to copy");
    expect(screen.getByRole("button", { name: /Copied!/ })).toBeInTheDocument();
  });

  it("Shift+D opens the research further dialog trigger", async () => {
    fetchMock.mockResolvedValue(responseFor(makeReport()));
    render(<ResearchPage />, { wrapper: ShortcutsProvider });
    const trigger = await screen.findByRole("button", { name: /Research further/ });
    const onClick = jest.fn();
    trigger.addEventListener("click", onClick);

    fireEvent.keyDown(document.body, { key: "D", shiftKey: true });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("u goes back to the item, or to the research list without one", async () => {
    mockPush.mockClear();
    fetchMock.mockResolvedValue(responseFor(makeReport()));
    const first = render(<ResearchPage />, { wrapper: ShortcutsProvider });
    await screen.findByRole("link", { name: /Back/ });
    fireEvent.keyDown(document.body, { key: "u" });
    expect(mockPush).toHaveBeenLastCalledWith("/feed/item-1");
    first.unmount();

    fetchMock.mockResolvedValue(responseFor(makeReport({ itemId: null })));
    render(<ResearchPage />, { wrapper: ShortcutsProvider });
    await screen.findByRole("link", { name: /Back/ });
    fireEvent.keyDown(document.body, { key: "u" });
    expect(mockPush).toHaveBeenLastCalledWith("/research");
  });

  it("renders a failed report without opening a stream", async () => {
    fetchMock.mockResolvedValue(
      responseFor(makeReport({ status: "failed", report: "Provider failed" }))
    );

    render(<ResearchPage />, { wrapper: ShortcutsProvider });

    expect(await screen.findByText("Provider failed")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("uses the fallback message for a failed report without details", async () => {
    fetchMock.mockResolvedValue(responseFor(makeReport({ status: "failed", report: "" })));

    render(<ResearchPage />, { wrapper: ShortcutsProvider });

    expect(await screen.findByText("Research failed. Please try again.")).toBeInTheDocument();
  });

  it("fetches the stored failure message once when an active stream fails", async () => {
    fetchMock
      .mockResolvedValueOnce(responseFor(makeReport({ status: "pending", report: "" })))
      .mockResolvedValueOnce(
        responseFor(makeReport({ status: "failed", report: "The research budget was reached." }))
      );
    render(<ResearchPage />, { wrapper: ShortcutsProvider });
    await screen.findByText("Research in progress");
    const stream = MockEventSource.instances[0];
    await act(async () => {
      stream.emit("status", JSON.stringify({ status: "failed" }));
      stream.emit("complete", "{}");
    });
    expect(await screen.findByText("The research budget was reached.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stream.close).toHaveBeenCalled();
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

    render(<ResearchPage />, { wrapper: ShortcutsProvider });

    expect(await screen.findByText("Research in progress")).toBeInTheDocument();
    expect(screen.getByText("Researching (2/4): Why?")).toBeInTheDocument();
    expect(MockEventSource.instances).toHaveLength(1);
    const stream = MockEventSource.instances[0];
    expect(stream.url).toBe("https://distil.test/api/ai/research/research-1/stream");

    act(() => {
      stream.emit("progress", JSON.stringify({ stage: "synthesizing" }));
      stream.emit("status", JSON.stringify({ status: "synthesizing" }));
    });

    // A run started before the outline/write stages reports `synthesizing`: shown as outlining.
    expect(screen.getByText("synthesizing")).toBeInTheDocument();
    expect(screen.getByText("Outlining the report...")).toBeInTheDocument();

    act(() => {
      stream.emit("progress", JSON.stringify({ stage: "outlining" }));
    });
    expect(screen.getByText("Outlining the report...")).toBeInTheDocument();
    expect(screen.getByText("Writing the report...")).toBeInTheDocument();

    act(() => {
      stream.emit(
        "progress",
        JSON.stringify({
          stage: "writing",
          current: 2,
          total: 5,
          heading: "How the options compare",
        })
      );
    });
    expect(screen.getByText("Writing (2/5): How the options compare")).toBeInTheDocument();
    // Earlier stages are shown as done, the writing stage as current.
    expect(screen.getByText("Outlining the report...").className).toContain("text-green-600");
    expect(screen.getByText("Writing (2/5): How the options compare").className).toContain(
      "font-medium"
    );
  });

  it("ignores malformed initial progress and malformed stream messages", async () => {
    fetchMock.mockResolvedValue(
      responseFor(makeReport({ status: "pending", progress: "not-json" }))
    );

    render(<ResearchPage />, { wrapper: ShortcutsProvider });

    expect(await screen.findByText("Planning research questions...")).toBeInTheDocument();
    const stream = MockEventSource.instances[0];
    act(() => {
      stream.emit("progress", "not-json");
      stream.emit("status", "not-json");
    });

    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText("Planning research questions...")).toBeInTheDocument();
  });

  it("shows the stage from string-encoded API progress as current", async () => {
    // The API sends `progress` as a JSON string (Production run 8bb4d982).
    fetchMock.mockResolvedValue(
      responseFor(
        makeReport({
          status: "running",
          progress: JSON.stringify({
            stage: "deepening",
            current: 2,
            total: 2,
            question: "What about battery?",
          }),
        })
      )
    );

    render(<ResearchPage />, { wrapper: ShortcutsProvider });

    const current = await screen.findByText("Deepening (2/2): What about battery?");
    expect(current.className).toContain("font-medium");
    expect(screen.getByText("Planning research questions...").className).toContain(
      "text-green-600"
    );
    expect(screen.getByText("Researched sub-questions").className).toContain("text-green-600");
    expect(screen.queryByText("Researching (0/1)")).not.toBeInTheDocument();
    expect(screen.getByText("Outlining the report...").className).toContain(
      "text-muted-foreground"
    );
  });

  it("reads double-encoded progress and stream events", async () => {
    fetchMock.mockResolvedValue(
      responseFor(
        makeReport({
          status: "running",
          progress: JSON.stringify(JSON.stringify({ stage: "outlining" })),
        })
      )
    );

    render(<ResearchPage />, { wrapper: ShortcutsProvider });

    expect((await screen.findByText("Outlining the report...")).className).toContain("font-medium");
    act(() => {
      MockEventSource.instances[0].emit(
        "progress",
        JSON.stringify(JSON.stringify({ stage: "writing", current: 1, total: 3, heading: "A" }))
      );
    });
    expect(screen.getByText("Writing (1/3): A").className).toContain("font-medium");
  });

  it("accepts object progress and displays zero defaults for an incomplete research event", async () => {
    fetchMock.mockResolvedValue(
      responseFor(makeReport({ status: "researching", progress: { stage: "researching" } }))
    );

    render(<ResearchPage />, { wrapper: ShortcutsProvider });

    expect(await screen.findByText("Researching (0/1)")).toBeInTheDocument();
  });

  it("closes and refreshes the report when the stream completes", async () => {
    fetchMock
      .mockResolvedValueOnce(responseFor(makeReport({ status: "running" })))
      .mockResolvedValueOnce(
        responseFor(makeReport({ status: "completed", report: "Final report" }))
      );

    render(<ResearchPage />, { wrapper: ShortcutsProvider });
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

  it("falls back to polling after an SSE error and stops polling on unmount", async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(responseFor(makeReport({ status: "running" })))
      .mockResolvedValueOnce(responseFor(makeReport({ status: "running" })))
      .mockResolvedValueOnce(
        responseFor(makeReport({ status: "completed", report: "Polled report" }))
      );
    const { unmount } = render(<ResearchPage />, { wrapper: ShortcutsProvider });
    await screen.findByText("Research in progress");
    const stream = MockEventSource.instances[0];

    act(() => stream.emit("error"));
    expect(stream.close).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // First poll: still running, so another poll is scheduled.
    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Second poll: terminal, so polling stops and the report renders.
    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await screen.findByText("Polled report")).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(10_000));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(MockEventSource.instances).toHaveLength(1);

    unmount();
    act(() => jest.advanceTimersByTime(10_000));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("switches to polling when the server closes the stream at its deadline", async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(responseFor(makeReport({ status: "running" })))
      .mockResolvedValueOnce(
        responseFor(makeReport({ status: "completed", report: "After timeout" }))
      );
    render(<ResearchPage />, { wrapper: ShortcutsProvider });
    await screen.findByText("Research in progress");
    const stream = MockEventSource.instances[0];

    act(() => stream.emit("timeout", JSON.stringify({ status: "running" })));
    expect(stream.close).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("After timeout")).toBeInTheDocument();
  });

  it("closes an open stream during unmount cleanup", async () => {
    fetchMock.mockResolvedValue(responseFor(makeReport({ status: "running" })));
    const { unmount } = render(<ResearchPage />, { wrapper: ShortcutsProvider });
    await screen.findByText("Research in progress");
    const stream = MockEventSource.instances[0];

    unmount();
    await waitFor(() => expect(stream.close).toHaveBeenCalledTimes(1));
  });

  it("only streams while the page is visible and online", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    fetchMock.mockResolvedValue(responseFor(makeReport({ status: "running" })));
    render(<ResearchPage />, { wrapper: ShortcutsProvider });
    await screen.findByText("Research in progress");
    expect(MockEventSource.instances).toHaveLength(0);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(MockEventSource.instances).toHaveLength(1);
    const stream = MockEventSource.instances[0];

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(stream.close).toHaveBeenCalledTimes(1);

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(MockEventSource.instances).toHaveLength(2);
  });

  it("does not update state or create a stream when the initial request settles after unmount", async () => {
    let resolveRequest!: (response: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      })
    );
    const { unmount } = render(<ResearchPage />, { wrapper: ShortcutsProvider });

    unmount();
    await act(async () => {
      resolveRequest(responseFor(makeReport({ status: "running" })));
      await Promise.resolve();
    });

    expect(MockEventSource.instances).toHaveLength(0);
  });
});
