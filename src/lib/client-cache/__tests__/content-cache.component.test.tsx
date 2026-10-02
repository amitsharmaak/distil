/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { ContentCacheProvider, useContentCache, useContentQuery } from "../content-cache";
import { announceAccountChange, CONTENT_AUTH_STORAGE_KEY } from "../auth-events";
import { reloadFullPage } from "@/lib/browser-navigation";

jest.mock("@/lib/browser-navigation", () => ({ reloadFullPage: jest.fn() }));

type Payload = { title: string };
function View({ initial, updatedAt }: { initial?: Payload; updatedAt?: number }) {
  const query = useContentQuery<Payload>({
    key: ["research", "list"],
    url: "/api/test",
    staleTime: 300_000,
    initialData: initial,
    initialDataUpdatedAt: updatedAt,
  });
  const cache = useContentCache();
  return (
    <div>
      <p>{query.data?.title ?? "Loading"}</p>
      {query.error && <span>Refresh failed</span>}
      <button onClick={() => void query.refetch()}>Refresh</button>
      <button onClick={() => void cache.invalidate(["research"])}>Invalidate</button>
    </div>
  );
}
const response = (title: string) =>
  ({ ok: true, status: 200, json: async () => ({ title }) }) as Response;
let mockFetch: jest.Mock;
beforeEach(() => {
  mockFetch = jest.fn();
  global.fetch = mockFetch;
  jest.mocked(reloadFullPage).mockReset();
});

it("survives development Strict Mode's effect replay without expiring the account", async () => {
  mockFetch.mockResolvedValue(response("Available report"));
  render(
    <StrictMode>
      <ContentCacheProvider accountKey="one">
        <View />
      </ContentCacheProvider>
    </StrictMode>
  );
  await screen.findByText("Available report");
  expect(screen.queryByText("Your session changed.")).not.toBeInTheDocument();
  expect(screen.queryByText("Refresh failed")).not.toBeInTheDocument();
});

it("deduplicates concurrent consumers and remounts from fresh account memory", async () => {
  mockFetch.mockResolvedValue(response("Stored report"));
  const { rerender } = render(
    <ContentCacheProvider accountKey="one">
      <View />
      <View />
    </ContentCacheProvider>
  );
  await screen.findAllByText("Stored report");
  expect(mockFetch).toHaveBeenCalledTimes(1);
  rerender(
    <ContentCacheProvider accountKey="one">
      <span>Another tab</span>
    </ContentCacheProvider>
  );
  rerender(
    <ContentCacheProvider accountKey="one">
      <View />
    </ContentCacheProvider>
  );
  expect(screen.getByText("Stored report")).toBeInTheDocument();
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

it("hydrates server data without a GET and refreshes once when explicitly requested", async () => {
  mockFetch.mockResolvedValue(response("New report"));
  render(
    <ContentCacheProvider accountKey="one">
      <View initial={{ title: "Server report" }} updatedAt={Date.now()} />
    </ContentCacheProvider>
  );
  expect(screen.getByText("Server report")).toBeInTheDocument();
  expect(mockFetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Refresh"));
  await screen.findByText("New report");
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

it("keeps stale data visible while refreshing and after a refresh failure", async () => {
  mockFetch.mockRejectedValue(new Error("offline"));
  render(
    <ContentCacheProvider accountKey="one">
      <View initial={{ title: "Older report" }} updatedAt={Date.now() - 400_000} />
    </ContentCacheProvider>
  );
  expect(screen.getByText("Older report")).toBeInTheDocument();
  await screen.findByText("Refresh failed");
  expect(screen.getByText("Older report")).toBeInTheDocument();
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

it("invalidates an active family once and does not overwrite cached results with older SSR props", async () => {
  mockFetch.mockResolvedValue(response("Updated report"));
  const { rerender } = render(
    <ContentCacheProvider accountKey="one">
      <View initial={{ title: "Old server report" }} />
    </ContentCacheProvider>
  );
  fireEvent.click(screen.getByText("Invalidate"));
  await screen.findByText("Updated report");
  rerender(
    <ContentCacheProvider accountKey="one">
      <span>Elsewhere</span>
    </ContentCacheProvider>
  );
  rerender(
    <ContentCacheProvider accountKey="one">
      <View initial={{ title: "Old server report" }} />
    </ContentCacheProvider>
  );
  expect(screen.getByText("Updated report")).toBeInTheDocument();
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

it("isolates account switches and ignores a previous account's late response", async () => {
  let finish!: (value: Response) => void;
  mockFetch
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        })
    )
    .mockResolvedValueOnce(response("Second account"));
  const { rerender } = render(
    <ContentCacheProvider accountKey="one">
      <View />
    </ContentCacheProvider>
  );
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  const signal = mockFetch.mock.calls[0][1].signal as AbortSignal;
  rerender(
    <ContentCacheProvider accountKey="two">
      <View />
    </ContentCacheProvider>
  );
  // The second account is never rendered inside the first account's document: route output
  // cached for the first account may still be reachable, so the document is reloaded instead.
  await screen.findByText("Your session changed.");
  expect(reloadFullPage).toHaveBeenCalledWith(window.location);
  await act(async () => finish(response("First account private data")));
  expect(signal.aborted).toBe(true);
  expect(screen.queryByText("First account private data")).not.toBeInTheDocument();
  expect(screen.queryByText("Second account")).not.toBeInTheDocument();
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

it("reloads the document when a later server render reports no account", async () => {
  mockFetch.mockResolvedValue(response("Unexpected"));
  const { rerender } = render(
    <ContentCacheProvider accountKey="one">
      <View initial={{ title: "Private report" }} updatedAt={Date.now()} />
    </ContentCacheProvider>
  );
  expect(screen.getByText("Private report")).toBeInTheDocument();
  expect(reloadFullPage).not.toHaveBeenCalled();

  // What `router.refresh()` after a sign-out delivers: the same tree for nobody.
  rerender(
    <ContentCacheProvider accountKey={null}>
      <View initial={{ title: "Private report" }} updatedAt={Date.now()} />
    </ContentCacheProvider>
  );

  expect(screen.getByText("Your session changed.")).toBeInTheDocument();
  expect(screen.queryByText("Private report")).not.toBeInTheDocument();
  expect(reloadFullPage).toHaveBeenCalledTimes(1);
  expect(reloadFullPage).toHaveBeenCalledWith(window.location);
  expect(mockFetch).not.toHaveBeenCalled();
});

it("keeps the document when an anonymous page signs in, then guards that account", async () => {
  const { rerender } = render(
    <ContentCacheProvider accountKey={null}>
      <p>Public page</p>
    </ContentCacheProvider>
  );
  rerender(
    <ContentCacheProvider accountKey="one">
      <View initial={{ title: "Private report" }} updatedAt={Date.now()} />
    </ContentCacheProvider>
  );
  expect(screen.getByText("Private report")).toBeInTheDocument();
  expect(reloadFullPage).not.toHaveBeenCalled();

  rerender(
    <ContentCacheProvider accountKey="two">
      <View initial={{ title: "Other account" }} updatedAt={Date.now()} />
    </ContentCacheProvider>
  );
  expect(screen.getByText("Your session changed.")).toBeInTheDocument();
  expect(screen.queryByText("Private report")).not.toBeInTheDocument();
  expect(screen.queryByText("Other account")).not.toBeInTheDocument();
  expect(reloadFullPage).toHaveBeenCalledTimes(1);
});

it.each(["local", "other-tab", "unauthorized"])(
  "clears cached content on %s session change",
  async (mode) => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 } as Response);
    render(
      <ContentCacheProvider accountKey="one">
        <View initial={{ title: "Private report" }} />
      </ContentCacheProvider>
    );
    if (mode === "local") act(() => announceAccountChange());
    else if (mode === "other-tab")
      act(() =>
        window.dispatchEvent(
          new StorageEvent("storage", { key: CONTENT_AUTH_STORAGE_KEY, newValue: "nonce" })
        )
      );
    else fireEvent.click(screen.getByText("Refresh"));
    await screen.findByText("Your session changed.");
    expect(screen.queryByText("Private report")).not.toBeInTheDocument();
  }
);

it("clears the cache without the notice in the tab that is leaving to sign in or out", async () => {
  mockFetch.mockResolvedValue(response("Fetched after the change"));
  render(
    <ContentCacheProvider accountKey="one">
      <View initial={{ title: "Private report" }} updatedAt={Date.now()} />
    </ContentCacheProvider>
  );
  const stored = jest.spyOn(Storage.prototype, "setItem");

  act(() => announceAccountChange({ leaving: true }));

  // The page stays as it is until the new document arrives; no intermediate notice.
  expect(screen.queryByText("Your session changed.")).not.toBeInTheDocument();
  // Other tabs are still told, and this tab can no longer read or keep content.
  expect(stored).toHaveBeenCalledWith(CONTENT_AUTH_STORAGE_KEY, expect.any(String));
  stored.mockRestore();
  fireEvent.click(screen.getByText("Refresh"));
  await screen.findByText("Refresh failed");
  expect(mockFetch).not.toHaveBeenCalled();
  expect(screen.queryByText("Fetched after the change")).not.toBeInTheDocument();
});

it("lets another tab continue by reloading its own URL after a session change", async () => {
  render(
    <ContentCacheProvider accountKey="one">
      <View initial={{ title: "Private report" }} />
    </ContentCacheProvider>
  );
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: CONTENT_AUTH_STORAGE_KEY, newValue: "nonce" })
    )
  );
  expect(await screen.findByText("Your session changed.")).toBeInTheDocument();
  expect(screen.queryByText("Private report")).not.toBeInTheDocument();
  expect(reloadFullPage).not.toHaveBeenCalled();

  // The browser may be signed in again (as anyone) or signed out; the server decides.
  fireEvent.click(screen.getByRole("link", { name: "Continue" }));
  expect(reloadFullPage).toHaveBeenCalledWith(window.location);
});

function Writer({ seed }: { seed: Payload }) {
  const cache = useContentCache();
  return (
    <>
      <View initial={seed} updatedAt={SEED_READ_AT} />
      <button onClick={() => cache.set<Payload>(["research", "list"], { title: "Saved locally" })}>
        Save
      </button>
    </>
  );
}
const SEED_READ_AT = Date.now();
function Filler({ index }: { index: number }) {
  useContentQuery<Payload>({
    key: ["filler", index],
    url: "/api/filler",
    staleTime: 300_000,
    initialData: { title: "filler" },
  });
  return null;
}
/** Enough newer inactive queries to push an older one past the inactive-query limit. */
const fillers = Array.from({ length: 61 }, (_, index) => <Filler key={index} index={index} />);

it("does not reuse a route's seed after a local write once the query was evicted", async () => {
  mockFetch.mockResolvedValue(response("Saved on the server"));
  const seed = { title: "Seed from before the save" };
  const tree = (children: React.ReactNode) => (
    <ContentCacheProvider accountKey="one">{children}</ContentCacheProvider>
  );
  const { rerender } = render(tree(<Writer seed={seed} />));
  expect(screen.getByText("Seed from before the save")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Save"));
  expect(await screen.findByText("Saved locally")).toBeInTheDocument();

  // Leave the page, then read enough other content for the saved query to be evicted.
  rerender(tree(fillers));
  rerender(tree(<p>Elsewhere</p>));
  expect(mockFetch).not.toHaveBeenCalled();

  // The reused route output still carries the old seed, well inside its freshness window.
  rerender(tree(<Writer seed={seed} />));
  expect(screen.queryByText("Seed from before the save")).not.toBeInTheDocument();
  expect(await screen.findByText("Saved on the server")).toBeInTheDocument();
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

it("trusts a seed from a server render made after the local write", async () => {
  const tree = (children: React.ReactNode) => (
    <ContentCacheProvider accountKey="one">{children}</ContentCacheProvider>
  );
  const { rerender } = render(tree(<Writer seed={{ title: "Seed from before the save" }} />));
  fireEvent.click(screen.getByText("Save"));
  expect(await screen.findByText("Saved locally")).toBeInTheDocument();
  rerender(tree(fillers));
  rerender(tree(<p>Elsewhere</p>));

  rerender(
    tree(<View initial={{ title: "Rendered after the save" }} updatedAt={SEED_READ_AT + 1} />)
  );
  expect(screen.getByText("Rendered after the save")).toBeInTheDocument();
  expect(mockFetch).not.toHaveBeenCalled();
});

it("still reuses an unwritten seed after eviction without a request", async () => {
  const seed = { title: "Seed nobody changed" };
  const tree = (children: React.ReactNode) => (
    <ContentCacheProvider accountKey="one">{children}</ContentCacheProvider>
  );
  const { rerender } = render(tree(<Writer seed={seed} />));
  rerender(tree(fillers));
  rerender(tree(<p>Elsewhere</p>));
  rerender(tree(<Writer seed={seed} />));
  expect(screen.getByText("Seed nobody changed")).toBeInTheDocument();
  expect(mockFetch).not.toHaveBeenCalled();
});
