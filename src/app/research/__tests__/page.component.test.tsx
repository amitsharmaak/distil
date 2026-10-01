/** @jest-environment jsdom */

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ResearchListPage from "../page";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";
import { ContentCacheProvider } from "@/lib/client-cache/content-cache";

jest.mock("next/navigation", () => ({
  usePathname: () => "/research",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
jest.mock("@/lib/config", () => ({ config: { apiBaseUrl: "https://distil.test" } }));
jest.mock("@/components/feed/deep-research", () => ({
  DeepResearch: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const fetchMock = jest.fn();
let accountNumber = 0;
let accountKey = "test-account-0";

function TestProviders({ children }: { children: React.ReactNode }) {
  return (
    <ContentCacheProvider accountKey={accountKey}>
      <ShortcutsProvider>{children}</ShortcutsProvider>
    </ContentCacheProvider>
  );
}

beforeEach(() => {
  accountKey = `test-account-${++accountNumber}`;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, init?: { method?: string }) => {
    if (init?.method === "POST") {
      return Promise.resolve({
        ok: true,
        json: async () => ({ clustersFound: 0, suggestionsSaved: 0 }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => (url.includes("suggestions") ? { suggestions: [] } : { reports: [] }),
    });
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: fetchMock,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function renderPage() {
  render(<ResearchListPage />, { wrapper: TestProviders });
  await screen.findByText("No research reports yet");
}

describe("Research list shortcuts", () => {
  it("n opens the new research trigger", async () => {
    await renderPage();
    const trigger = screen.getByRole("button", { name: /Deep Research/ });
    const onClick = jest.fn();
    trigger.addEventListener("click", onClick);
    fireEvent.keyDown(document.body, { key: "n" });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveAttribute("aria-keyshortcuts", "n");
  });

  it("Shift+S starts a scan", async () => {
    await renderPage();
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "S", shiftKey: true });
    });
    expect(fetchMock).toHaveBeenCalledWith("https://distil.test/api/ai/research/proactive", {
      method: "POST",
    });
    expect(screen.getByRole("button", { name: "Scan for topics" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Shift+S"
    );
  });

  it("reuses fresh reports and suggestions when the page remounts", async () => {
    const view = render(
      <TestProviders>
        <ResearchListPage />
      </TestProviders>
    );
    await screen.findByText("No research reports yet");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    view.rerender(
      <TestProviders>
        <div>Elsewhere</div>
      </TestProviders>
    );
    view.rerender(
      <TestProviders>
        <ResearchListPage />
      </TestProviders>
    );

    await screen.findByText("No research reports yet");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("shows stale reports immediately and refreshes them once on remount", async () => {
    let now = Date.parse("2026-10-01T00:00:00.000Z");
    jest.spyOn(Date, "now").mockImplementation(() => now);
    let reportRequests = 0;
    let resolveRefresh!: (response: Response) => void;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("suggestions")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ suggestions: [] }),
        });
      }
      reportRequests += 1;
      if (reportRequests === 1) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            reports: [
              {
                id: "old-report",
                query: "Cached report",
                status: "completed",
                createdAt: "2026-09-30T00:00:00.000Z",
              },
            ],
          }),
        });
      }
      return new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      });
    });

    const view = render(
      <TestProviders>
        <ResearchListPage />
      </TestProviders>
    );
    expect(await screen.findByText("Cached report")).toBeInTheDocument();
    view.rerender(
      <TestProviders>
        <div>Elsewhere</div>
      </TestProviders>
    );
    now += 300_001;
    view.rerender(
      <TestProviders>
        <ResearchListPage />
      </TestProviders>
    );

    expect(screen.getByText("Cached report")).toBeInTheDocument();
    await waitFor(() => expect(reportRequests).toBe(2));

    await act(async () => {
      resolveRefresh({
        ok: true,
        json: async () => ({ reports: [] }),
      } as Response);
      await Promise.resolve();
    });
    expect(await screen.findByText("No research reports yet")).toBeInTheDocument();
    expect(reportRequests).toBe(2);
  });
});
