/** @jest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { ContentCacheProvider, useContentCache } from "../content-cache";
import { useItemMutation } from "../item-mutations";

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
