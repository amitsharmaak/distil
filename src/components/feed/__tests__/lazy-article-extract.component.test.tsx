/**
 * @jest-environment jsdom
 */

import { act, render, screen } from "@testing-library/react";
import {
  CACHE_FRESHNESS,
  ContentCacheProvider,
  useContentQuery,
} from "@/lib/client-cache/content-cache";
import { LazyArticleExtract } from "../lazy-article-extract";

const mockRefresh = jest.fn();
const mockRouter = { refresh: mockRefresh };

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

function response({ ok = true, extracted = false }: { ok?: boolean; extracted?: boolean } = {}) {
  return {
    ok,
    json: jest.fn().mockResolvedValue({ extracted }),
  } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderWithCache(children: React.ReactNode) {
  return render(<ContentCacheProvider accountKey="test-account">{children}</ContentCacheProvider>);
}

function ActiveListQueries() {
  useContentQuery({
    key: ["feed", "test"],
    url: "/test/feed-refresh",
    staleTime: CACHE_FRESHNESS.feed,
    initialData: { items: [] },
  });
  useContentQuery({
    key: ["today", "test"],
    url: "/test/today-refresh",
    staleTime: CACHE_FRESHNESS.feed,
    initialData: { items: [] },
  });
  return null;
}

describe("LazyArticleExtract", () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.mocked(global.fetch);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      label: "full content",
      hasFullContent: true,
      contentExtractedAt: undefined,
      url: "https://a.test",
    },
    {
      label: "a prior attempt",
      hasFullContent: false,
      contentExtractedAt: "2026-01-01T00:00:00.000Z",
      url: "https://a.test",
    },
    { label: "no URL", hasFullContent: false, contentExtractedAt: undefined, url: "" },
  ])("renders children without fetching when it has $label", (props) => {
    renderWithCache(
      <LazyArticleExtract itemId="item-1" {...props}>
        <p>Article body</p>
      </LazyArticleExtract>
    );

    expect(screen.getByText("Article body")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes the reader and invalidates cached lists after successful extraction", async () => {
    const request = deferred<Response>();
    fetchMock.mockImplementation((url) =>
      String(url).includes("/extract")
        ? request.promise
        : Promise.resolve({ ok: true, json: async () => ({ items: [] }) } as Response)
    );

    renderWithCache(
      <>
        <ActiveListQueries />
        <LazyArticleExtract itemId="item-1" url="https://article.test" hasFullContent={false}>
          <p>Article body</p>
        </LazyArticleExtract>
      </>
    );

    expect(screen.getByText("Loading article content…")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/items/item-1/extract", {
      method: "POST",
    });

    act(() => {
      request.resolve(response({ extracted: true }));
    });

    expect(await screen.findByText("Article body")).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/test/feed-refresh", {
      signal: expect.any(AbortSignal),
    });
    expect(fetchMock).toHaveBeenCalledWith("/test/today-refresh", {
      signal: expect.any(AbortSignal),
    });
  });

  it("refreshes when the server reports that extraction was already attempted", async () => {
    fetchMock.mockResolvedValue(response({ extracted: false }));

    renderWithCache(
      <LazyArticleExtract itemId="item-2" url="https://article.test" hasFullContent={false}>
        <p>Fallback body</p>
      </LazyArticleExtract>
    );

    expect(await screen.findByText("Fallback body")).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: "the endpoint rejects the request", result: response({ ok: false }) },
    { label: "the network request fails", result: new Error("offline") },
  ])("refreshes to roll back when $label", async ({ result }) => {
    if (result instanceof Error) fetchMock.mockRejectedValue(result);
    else fetchMock.mockResolvedValue(result);

    renderWithCache(
      <LazyArticleExtract itemId="item-3" url="https://article.test" hasFullContent={false}>
        <p>Fallback body</p>
      </LazyArticleExtract>
    );

    expect(await screen.findByText("Fallback body")).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("settles after a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    renderWithCache(
      <LazyArticleExtract itemId="item-3" url="https://article.test" hasFullContent={false}>
        <p>Fallback body</p>
      </LazyArticleExtract>
    );

    expect(await screen.findByText("Fallback body")).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("ignores a successful response after unmount", async () => {
    const request = deferred<Response>();
    fetchMock.mockReturnValue(request.promise);
    const { unmount } = renderWithCache(
      <LazyArticleExtract itemId="item-4" url="https://article.test" hasFullContent={false}>
        <p>Fallback body</p>
      </LazyArticleExtract>
    );

    unmount();
    act(() => {
      request.resolve(response({ extracted: true }));
    });
    await request.promise;

    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("ignores a failed response after unmount", async () => {
    const request = deferred<Response>();
    fetchMock.mockReturnValue(request.promise);
    const { unmount } = renderWithCache(
      <LazyArticleExtract itemId="item-5" url="https://article.test" hasFullContent={false}>
        <p>Fallback body</p>
      </LazyArticleExtract>
    );

    unmount();
    act(() => {
      request.reject(new Error("offline"));
    });
    await request.promise.catch(() => undefined);

    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
