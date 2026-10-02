/** @jest-environment jsdom */

import { act, fireEvent, render, screen } from "@testing-library/react";

import { IntentLink, ResearchListIntentLink, ResearchReportIntentLink } from "../intent-link";

const mockRouterPrefetch = jest.fn();
const mockCachePrefetch = jest.fn().mockResolvedValue(undefined);

jest.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: mockRouterPrefetch }),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    prefetch,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => (
    <a {...props} data-prefetch={String(prefetch)}>
      {children}
    </a>
  ),
}));

jest.mock("@/lib/client-cache/content-cache", () => ({
  CACHE_FRESHNESS: { library: 300_000, detail: 1_800_000 },
  useContentCache: () => ({ prefetch: mockCachePrefetch }),
}));

beforeEach(() => {
  jest.useFakeTimers();
  mockRouterPrefetch.mockReset();
  mockCachePrefetch.mockClear();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(navigator, "connection", { configurable: true, value: undefined });
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

it("keeps canonical link navigation while disabling viewport prefetch", () => {
  const onClick = jest.fn();
  render(
    <IntentLink href="/feed/viewport-free" onClick={onClick}>
      Open item
    </IntentLink>
  );

  const link = screen.getByRole("link", { name: "Open item" });
  expect(link).toHaveAttribute("href", "/feed/viewport-free");
  expect(link).toHaveAttribute("data-prefetch", "false");
  expect(mockRouterPrefetch).not.toHaveBeenCalled();
  fireEvent.click(link);
  expect(onClick).toHaveBeenCalledTimes(1);
});

it("debounces hover intent, cancels cursor transit, and deduplicates repeated intent", () => {
  const warm = jest.fn();
  render(
    <>
      <IntentLink href="/feed/hover-intent" onIntent={warm}>
        First
      </IntentLink>
      <IntentLink href="/feed/hover-intent" onIntent={warm}>
        Duplicate
      </IntentLink>
    </>
  );

  const first = screen.getByRole("link", { name: "First" });
  fireEvent.mouseEnter(first);
  act(() => jest.advanceTimersByTime(99));
  expect(mockRouterPrefetch).not.toHaveBeenCalled();
  fireEvent.mouseLeave(first);
  act(() => jest.advanceTimersByTime(1));
  expect(mockRouterPrefetch).not.toHaveBeenCalled();

  fireEvent.mouseEnter(first);
  act(() => jest.advanceTimersByTime(100));
  expect(mockRouterPrefetch).toHaveBeenCalledWith("/feed/hover-intent");
  expect(warm).toHaveBeenCalledTimes(1);

  fireEvent.focus(screen.getByRole("link", { name: "Duplicate" }));
  fireEvent.touchStart(first);
  expect(mockRouterPrefetch).toHaveBeenCalledTimes(1);
  expect(warm).toHaveBeenCalledTimes(1);
});

it("prefetches immediately for keyboard and touch intent", () => {
  render(
    <>
      <IntentLink href="/feed/focus-intent">Focus</IntentLink>
      <IntentLink href="/feed/touch-intent">Touch</IntentLink>
    </>
  );

  fireEvent.focus(screen.getByRole("link", { name: "Focus" }));
  fireEvent.touchStart(screen.getByRole("link", { name: "Touch" }));
  expect(mockRouterPrefetch.mock.calls).toEqual([["/feed/focus-intent"], ["/feed/touch-intent"]]);
});

it("does not prefetch while hidden, offline, or using data saver", () => {
  render(
    <>
      <IntentLink href="/blocked-hidden">Hidden</IntentLink>
      <IntentLink href="/blocked-offline">Offline</IntentLink>
      <IntentLink href="/blocked-save-data">Save data</IntentLink>
    </>
  );

  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  fireEvent.focus(screen.getByRole("link", { name: "Hidden" }));

  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  fireEvent.focus(screen.getByRole("link", { name: "Offline" }));

  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    value: { saveData: true },
  });
  fireEvent.focus(screen.getByRole("link", { name: "Save data" }));

  expect(mockRouterPrefetch).not.toHaveBeenCalled();
});

it("warms Research list data and one report using the shared cache contracts", () => {
  render(
    <>
      <ResearchListIntentLink href="/research">Research</ResearchListIntentLink>
      <ResearchReportIntentLink href="/research/report-1" reportId="report-1">
        Report
      </ResearchReportIntentLink>
    </>
  );

  fireEvent.focus(screen.getByRole("link", { name: "Research" }));
  expect(mockCachePrefetch).toHaveBeenNthCalledWith(1, {
    key: ["research", "list"],
    url: "/api/ai/research/list",
    staleTime: 300_000,
  });
  expect(mockCachePrefetch).toHaveBeenNthCalledWith(2, {
    key: ["research", "suggestions"],
    url: "/api/ai/research/suggestions",
    staleTime: 300_000,
  });

  fireEvent.focus(screen.getByRole("link", { name: "Report" }));
  expect(mockCachePrefetch).toHaveBeenNthCalledWith(3, {
    key: ["research", "report", "report-1"],
    url: "/api/ai/research/report-1",
    staleTime: 1_800_000,
  });
});
