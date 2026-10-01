/**
 * @jest-environment jsdom
 */

import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { Topbar } from "../topbar";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => "/feed/one",
  useRouter: () => ({ push: mockPush }),
}));

const render = (ui: React.ReactElement) => rtlRender(<ShortcutsProvider>{ui}</ShortcutsProvider>);

jest.mock("@/components/layout/theme-toggle", () => ({
  ThemeToggle: ({ collapsed }: { collapsed?: boolean }) => (
    <button type="button" data-testid="theme-toggle" data-collapsed={String(Boolean(collapsed))}>
      Toggle theme
    </button>
  ),
}));

describe("Topbar", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders a compact wordmark, page title and phone theme toggle", () => {
    render(<Topbar />);

    expect(screen.getByRole("link", { name: "Distil home" })).toHaveTextContent("distil");
    expect(screen.getByText("Reading")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveClass("md:hidden");
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-collapsed", "true");
  });

  it("carries the standalone safe-area hook so it sticks below the iPhone status bar", () => {
    render(<Topbar />);

    expect(screen.getByRole("banner")).toHaveClass("distil-topbar", "sticky", "top-0");
  });

  it("does not render a search input, notification bell or agent controls", () => {
    render(<Topbar />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    // Search lives in the Feed page header; the top bar has no search entry.
    expect(screen.queryByRole("link", { name: "Search" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask Distil" })).not.toBeInTheDocument();
  });

  it("replaces the wordmark with a back link on reader routes", () => {
    render(<Topbar backHref="/feed" />);

    expect(screen.getByRole("link", { name: "Back to feed" })).toHaveAttribute("href", "/feed");
    expect(screen.queryByRole("link", { name: "Distil home" })).not.toBeInTheDocument();
  });

  it("u and Escape go back on reader routes; nothing on other routes", () => {
    const { unmount } = render(<Topbar backHref="/feed" />);
    fireEvent.keyDown(window, { key: "u" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledWith("/feed");
    expect(screen.getByRole("link", { name: "Back to feed" })).toHaveAttribute(
      "aria-keyshortcuts",
      "u Escape"
    );
    unmount();
    mockPush.mockClear();
    render(<Topbar />);
    fireEvent.keyDown(window, { key: "u" });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
