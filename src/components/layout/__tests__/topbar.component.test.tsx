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
    jest.spyOn(Date.prototype, "toLocaleDateString").mockReturnValue("Wednesday, January 15");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders the date and an icon-only theme toggle", () => {
    render(<Topbar />);

    expect(screen.getByText("Wednesday, January 15")).toBeInTheDocument();
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-collapsed", "true");
  });

  it("does not render a search input, notification bell or agent controls", () => {
    render(<Topbar />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    // Search lives in the Feed page header; the top bar has no search entry.
    expect(screen.queryByRole("link", { name: "Search" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask Distil" })).not.toBeInTheDocument();
  });

  it("replaces the date with a back link on reader routes", () => {
    render(<Topbar backHref="/feed" />);

    expect(screen.getByRole("link", { name: "Back to feed" })).toHaveAttribute("href", "/feed");
    expect(screen.queryByText("Wednesday, January 15")).not.toBeInTheDocument();
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
