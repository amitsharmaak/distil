/**
 * @jest-environment jsdom
 */

import { act, render, screen } from "@testing-library/react";
import { LazyArticleExtract } from "../lazy-article-extract";

const mockRefresh = jest.fn();
const mockRouter = { refresh: mockRefresh };

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("@/lib/config", () => ({
  config: { apiBaseUrl: "https://distil.test" },
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
    render(
      <LazyArticleExtract itemId="item-1" {...props}>
        <p>Article body</p>
      </LazyArticleExtract>
    );

    expect(screen.getByText("Article body")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows progress, completes extraction, and refreshes only when content changed", async () => {
    const request = deferred<Response>();
    fetchMock.mockReturnValue(request.promise);

    render(
      <LazyArticleExtract itemId="item-1" url="https://article.test" hasFullContent={false}>
        <p>Article body</p>
      </LazyArticleExtract>
    );

    expect(screen.getByText("Loading article content…")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("https://distil.test/api/items/item-1/extract", {
      method: "POST",
    });

    act(() => {
      request.resolve(response({ extracted: true }));
    });

    expect(await screen.findByText("Article body")).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: "no content was extracted", result: response({ extracted: false }) },
    { label: "the endpoint rejects the request", result: response({ ok: false }) },
  ])("settles without refreshing when $label", async ({ result }) => {
    fetchMock.mockResolvedValue(result);

    render(
      <LazyArticleExtract itemId="item-2" url="https://article.test" hasFullContent={false}>
        <p>Fallback body</p>
      </LazyArticleExtract>
    );

    expect(await screen.findByText("Fallback body")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("settles after a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    render(
      <LazyArticleExtract itemId="item-3" url="https://article.test" hasFullContent={false}>
        <p>Fallback body</p>
      </LazyArticleExtract>
    );

    expect(await screen.findByText("Fallback body")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("ignores a successful response after unmount", async () => {
    const request = deferred<Response>();
    fetchMock.mockReturnValue(request.promise);
    const { unmount } = render(
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
    const { unmount } = render(
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
