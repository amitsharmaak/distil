/** @jest-environment jsdom */
import { renderWithContentCache as render } from "../../../../tests/support/content-cache";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { DetailActionBar } from "../detail-action-bar-content";
import { ArticleNavigation } from "../article-navigation";
import { Topbar } from "@/components/layout/topbar";
import { ReaderAreaBadge } from "../reader-area-badge";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";

const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => "/feed/one",
  useRouter: () => ({ push: mockPush, refresh: mockRefresh, prefetch: jest.fn() }),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

jest.mock("@/components/layout/theme-toggle", () => ({ ThemeToggle: () => null }));
const fetchMock = jest.fn();
global.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

function setup(props: Partial<React.ComponentProps<typeof DetailActionBar>> = {}) {
  return render(
    <ShortcutsProvider>
      <ArticleNavigation prevId="p1" nextId="n1" />
      <DetailActionBar
        itemId="one"
        url="https://example.com/a"
        title="Title"
        isRead={false}
        prevId="p1"
        nextId="n1"
        {...props}
      />
    </ShortcutsProvider>
  );
}
const press = (init: KeyboardEventInit) => fireEvent.keyDown(window, init);

beforeEach(() => {
  mockPush.mockReset();
  mockRefresh.mockReset();
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({}) });
  global.fetch = fetchMock as unknown as typeof fetch;
});

it("j/k and the arrows navigate between items", () => {
  setup();
  press({ key: "j" });
  press({ key: "ArrowRight" });
  press({ key: "k" });
  expect(mockPush.mock.calls.map((c) => c[0])).toEqual(["/feed/n1", "/feed/n1", "/feed/p1"]);
});

it("o opens the original in a new tab without opener", () => {
  const open = jest.spyOn(window, "open").mockReturnValue(null);
  setup();
  press({ key: "o" });
  expect(open).toHaveBeenCalledWith("https://example.com/a", "_blank", "noopener,noreferrer");
});

it("+ and - rate the item", async () => {
  setup();
  press({ key: "+" });
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/feedback",
      expect.objectContaining({ body: JSON.stringify({ itemId: "one", rating: 1 }) })
    )
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Liked" })).toBeEnabled());
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  press({ key: "-" });
  await waitFor(() =>
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/ai/feedback",
      expect.objectContaining({ body: JSON.stringify({ itemId: "one", rating: -1 }) })
    )
  );
});

it("Shift+U marks unread with { isRead: false } and flips state; only when read", async () => {
  setup({ isRead: true });
  expect(screen.getByRole("button", { name: "Mark as unread" })).toBeEnabled();
  press({ key: "U", shiftKey: true });
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/items/one/state",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isRead: false }) })
    )
  );
  expect(await screen.findByRole("button", { name: "Mark as read" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Mark as unread" })).toBeNull();
  fetchMock.mockClear();
  press({ key: "U", shiftKey: true });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("renders Mark read as a secondary control with the r hint, and toggles through the button", async () => {
  setup();
  const button = screen.getByRole("button", { name: "Mark as read" });
  expect(button).toHaveAttribute("data-variant", "ghost");
  expect(button).toHaveAttribute("aria-keyshortcuts", "r");
  expect(button).toHaveClass("h-11", "text-muted-foreground");
  expect(button).not.toHaveClass("bg-primary");
  expect(button).toHaveTextContent("Mark read");
  const hint = button.querySelector("kbd");
  expect(hint).toHaveTextContent("r");
  expect(hint).toHaveClass("hidden", "pointer-fine:inline-flex");
  for (const name of ["Like", "Dislike", "More reader actions"]) {
    expect(screen.getByRole("button", { name })).toHaveAttribute("data-variant", "ghost");
  }

  fireEvent.click(button);
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/items/one/state",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isRead: true }) })
    )
  );
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/feed/n1"));
  const readButton = await screen.findByRole("button", { name: "Mark as unread" });
  expect(readButton).toHaveAttribute("data-read", "true");
  expect(readButton).toHaveAttribute("aria-keyshortcuts", "Shift+U");
  // Only the check is coloured; the label stays as muted as the unread label and the siblings.
  expect(readButton).toHaveClass("text-muted-foreground");
  expect(readButton).not.toHaveClass("text-success");
  expect(readButton).toHaveTextContent("Mark unread");
  expect(readButton.querySelector("kbd")).toBeNull();
  expect(readButton.querySelector("svg")).toHaveClass("fill-current", "text-success");

  fetchMock.mockClear();
  fireEvent.click(readButton);
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/items/one/state",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isRead: false }) })
    )
  );
  expect(await screen.findByRole("button", { name: "Mark as read" })).toBeEnabled();
});

it("Shift+D opens Deep research, and Escape-style shortcuts stay quiet while it is open", async () => {
  setup();
  press({ key: "D", shiftKey: true });
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  press({ key: "j" });
  press({ key: "o" });
  expect(mockPush).not.toHaveBeenCalled();
});

it("Shift+C copies the location and shows Copied briefly", async () => {
  jest.useFakeTimers();
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  setup();
  await act(async () => {
    press({ key: "C", shiftKey: true });
  });
  expect(writeText).toHaveBeenCalledWith(window.location.href);
  expect(screen.getByRole("status")).toHaveTextContent("Copied");
  act(() => {
    jest.advanceTimersByTime(1600);
  });
  expect(screen.getByRole("status")).toHaveTextContent("");
  jest.useRealTimers();
});

it("does not swallow Cmd+R or Alt+Left", () => {
  setup();
  for (const init of [
    { key: "r", metaKey: true },
    { key: "r", ctrlKey: true },
    { key: "ArrowLeft", altKey: true },
  ]) {
    const ev = new KeyboardEvent("keydown", { ...init, cancelable: true, bubbles: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  }
  expect(mockPush).not.toHaveBeenCalled();
});

it("a opens the area menu", async () => {
  render(
    <ShortcutsProvider>
      <ReaderAreaBadge itemId="one" area="work" aiArea="work" />
    </ShortcutsProvider>
  );
  press({ key: "a" });
  expect(await screen.findByRole("menu")).toBeInTheDocument();
});

it("Escape with the area menu open does not navigate back", async () => {
  render(
    <ShortcutsProvider>
      <Topbar backHref="/feed" />
      <ReaderAreaBadge itemId="one" area="work" aiArea="work" />
    </ShortcutsProvider>
  );
  press({ key: "a" });
  await screen.findByRole("menu");
  press({ key: "Escape" });
  expect(mockPush).not.toHaveBeenCalled();
});

it("Deep research returns focus to its button on close", async () => {
  setup();
  press({ key: "D", shiftKey: true });
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "More reader actions" })).toHaveFocus()
  );
});

it("overflow actions preserve accessible names and registered shortcuts", async () => {
  setup({ isRead: true });
  for (const [name, keys] of [
    ["Previous item", "ArrowLeft k"],
    ["Next item", "ArrowRight j"],
  ]) {
    expect(screen.getByRole("link", { name })).toHaveAttribute("aria-keyshortcuts", keys);
  }
  for (const [name, keys] of [
    ["Like", "+"],
    ["Dislike", "-"],
  ]) {
    expect(screen.getByRole("button", { name })).toHaveAttribute("aria-keyshortcuts", keys);
  }
  fireEvent.keyDown(screen.getByRole("button", { name: "More reader actions" }), { key: "Enter" });
  await screen.findByRole("menu");
  for (const [name, keys] of [
    ["View original", "o"],
    ["Deep research", "Shift+D"],
    ["Copy link", "Shift+C"],
    ["Mark as unread", "Shift+U"],
  ]) {
    expect(screen.getByRole("menuitem", { name })).toHaveAttribute("aria-keyshortcuts", keys);
  }
  press({ key: "j" });
  expect(mockPush).not.toHaveBeenCalled();
});
