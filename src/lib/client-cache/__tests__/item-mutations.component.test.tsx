/** @jest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { ContentCacheProvider, useContentCache } from "../content-cache";
import { useItemMutation, useItemOverrides } from "../item-mutations";

beforeEach(() => jest.mocked(fetch).mockReset());

function setup() {
  return renderHook(() => ({ cache: useContentCache(), ...useItemMutation() }), {
    wrapper: ({ children }) => (
      <ContentCacheProvider accountKey="one">{children}</ContentCacheProvider>
    ),
  });
}

it("updates every cached list and reader override after a read/area mutation", async () => {
  const { result } = setup();
  const item = { id: "a", isRead: false, area: "work" };
  const { cache } = result.current;
  cache.set(["feed", "one"], { items: [item], nextCursor: "next" });
  cache.set(["today", "sections"], { sections: { priority: [item], revisiting: [] } });
  cache.set(["library", "archive"], { items: [item] });
  jest.mocked(fetch).mockResolvedValue({ ok: true } as Response);
  await act(async () => result.current.updateItem("a", { isRead: true, area: "personal" }));
  for (const family of [
    ["feed", "one"],
    ["library", "archive"],
  ]) {
    expect(cache.get(family)).toMatchObject({
      items: [{ id: "a", isRead: true, area: "personal" }],
    });
  }
  expect(cache.get(["today", "sections"])).toMatchObject({
    sections: { priority: [{ isRead: true }] },
  });
  expect(cache.get(["item", "a", "changes"])).toEqual({ isRead: true, area: "personal" });
});

it("rolls back just the failed item while preserving another edit and appended items", async () => {
  const { result } = setup();
  const { cache } = result.current;
  const key = ["feed", "one"];
  cache.set(key, {
    items: [
      { id: "a", isRead: false },
      { id: "b", isRead: false },
    ],
  });
  let finishA!: (value: Response) => void;
  jest.mocked(fetch).mockImplementation((url) =>
    String(url).includes("/a/")
      ? new Promise((resolve) => {
          finishA = resolve;
        })
      : Promise.resolve({ ok: true } as Response)
  );
  let failed!: Promise<void>;
  act(() => {
    failed = result.current.updateItem("a", { isRead: true }).catch(() => undefined);
  });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await act(async () => result.current.updateItem("b", { isRead: true }));
  cache.set<{ items: Array<{ id: string; isRead: boolean }> }>(key, (old) => ({
    items: [...old!.items, { id: "c", isRead: false }],
  }));
  await act(async () => {
    finishA({ ok: false, status: 500 } as Response);
    await failed;
  });
  expect(cache.get(key)).toEqual({
    items: [
      { id: "a", isRead: false },
      { id: "b", isRead: true },
      { id: "c", isRead: false },
    ],
  });
});

it("serializes same-item writes across independent mutation hook instances", async () => {
  const { result } = renderHook(
    () => ({
      cache: useContentCache(),
      first: useItemMutation(),
      second: useItemMutation(),
    }),
    {
      wrapper: ({ children }) => (
        <ContentCacheProvider accountKey="one">{children}</ContentCacheProvider>
      ),
    }
  );
  const key = ["feed", "one"];
  result.current.cache.set(key, {
    items: [{ id: "a", manualPriority: null }],
  });
  let finishFirst!: (value: Response) => void;
  jest
    .mocked(fetch)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        })
    )
    .mockResolvedValueOnce({ ok: true } as Response);

  let failed!: Promise<void>;
  let succeeded!: Promise<void>;
  act(() => {
    failed = result.current.first
      .updateItem("a", { manualPriority: "high" })
      .catch(() => undefined);
    succeeded = result.current.second.updateItem("a", { manualPriority: "low" });
  });

  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(result.current.cache.get(key)).toMatchObject({
    items: [{ id: "a", manualPriority: "high" }],
  });

  await act(async () => {
    finishFirst({ ok: false, status: 500 } as Response);
    await failed;
    await succeeded;
  });

  expect(fetch).toHaveBeenCalledTimes(2);
  expect(result.current.cache.get(key)).toEqual({
    items: [{ id: "a", manualPriority: "low" }],
  });
});

it("waits for an optimistic write before starting a new read", async () => {
  const { result } = setup();
  const { cache } = result.current;
  const release = cache.beginWrite();
  jest.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ items: [] }) } as Response);
  const pending = cache.prefetch({ key: ["feed", "one"], url: "/api/v1/feed", staleTime: 1000 });
  await act(async () => {
    await Promise.resolve();
  });
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => {
    release();
    await pending;
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("reconciles cleared fields and revisiting items from authoritative refreshes", async () => {
  const { result } = setup();
  const { cache } = result.current;
  cache.set(["item", "a", "changes"], {
    isRead: true,
    archived: true,
    manualPriority: "high",
    area: "work",
  });
  jest.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ items: [], resurfacedItems: [{ id: "a", isRead: false }] }),
  } as Response);
  await act(async () =>
    cache.fetch({ key: ["today", "sections"], url: "/api/v1/feed", staleTime: 1000 })
  );
  expect(cache.get(["item", "a", "changes"])).toEqual({
    isRead: false,
    archived: false,
    manualPriority: null,
    area: undefined,
  });
});

it("expires a reader override even while its disabled query stays observed", async () => {
  jest.useFakeTimers();
  try {
    const { result, unmount } = renderHook(
      () => ({ cache: useContentCache(), overrides: useItemOverrides("a") }),
      {
        wrapper: ({ children }) => (
          <ContentCacheProvider accountKey="one">{children}</ContentCacheProvider>
        ),
      }
    );
    await act(async () => {
      result.current.cache.set(["item", "a", "changes"], { isRead: true });
    });
    await act(async () => jest.advanceTimersByTime(1));
    expect(result.current.overrides).toEqual({ isRead: true });
    await act(async () => jest.advanceTimersByTime(30 * 60_000));
    expect(result.current.overrides).toBeUndefined();
    unmount();
  } finally {
    jest.useRealTimers();
  }
});
