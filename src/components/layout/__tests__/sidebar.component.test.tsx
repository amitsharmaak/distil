/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { Sidebar } from "../sidebar";
import { ContentCacheProvider } from "@/lib/client-cache/content-cache";

const mockUsePathname = jest.fn<string, []>();

jest.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ prefetch: jest.fn() }),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    prefetch,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => (
    <a {...props} data-prefetch={prefetch === false ? "false" : "default"}>
      {children}
    </a>
  ),
}));

jest.mock("@/components/layout/theme-toggle", () => ({
  ThemeToggle: ({ collapsed, className }: { collapsed?: boolean; className?: string }) => (
    <span
      data-testid="theme-toggle"
      data-collapsed={String(Boolean(collapsed))}
      className={className}
    />
  ),
}));

describe("Sidebar", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const renderSidebar = () =>
    render(
      <ContentCacheProvider accountKey="sidebar-test">
        <Sidebar />
      </ContentCacheProvider>
    );

  it("renders the expanded brand and all navigation destinations", () => {
    renderSidebar();

    const logo = screen.getByRole("img", { name: "Distil logo" });
    expect(logo.tagName.toLowerCase()).toBe("svg");
    expect(logo).toHaveAttribute("height", "28");
    // 28 px tall lockup with the 24-unit gap: 28 × 316.87 / 104.
    expect(Number(logo.getAttribute("width"))).toBeCloseTo(85.31, 2);
    expect(logo.querySelectorAll("path")).toHaveLength(2);
    // Brand row padding (20 px) matches nav px-2 + row px-3, so the mark's ink shares the icons'
    // left edge.
    expect(logo.parentElement).toHaveClass("px-5");
    expect(logo.parentElement).not.toHaveClass("justify-center");
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Feed" })).toHaveAttribute("href", "/feed");
    expect(screen.getByRole("link", { name: "Research" })).toHaveAttribute("href", "/research");
    expect(screen.getByRole("link", { name: "Save" })).toHaveAttribute("href", "/save");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-collapsed", "false");
  });

  it("keeps legacy and library surfaces out of primary navigation", () => {
    renderSidebar();

    for (const name of [
      "Search",
      "Ask",
      "Digests",
      ["Collec", "tions"].join(""),
      "Archive",
      "Topics",
      "Sources",
    ]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
  });

  it("disables viewport prefetch for every destination", () => {
    renderSidebar();

    for (const name of ["Today", "Feed", "Research", "Save", "Settings"]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("data-prefetch", "false");
    }
  });

  it("marks only the exact home route active", () => {
    renderSidebar();

    expect(screen.getByRole("link", { name: "Today" })).toHaveClass("bg-sidebar-accent");
    expect(screen.getByRole("link", { name: "Feed" })).not.toHaveClass("bg-sidebar-accent");
  });

  it("marks nested section routes active", () => {
    mockUsePathname.mockReturnValue("/feed/article-1");

    renderSidebar();

    expect(screen.getByRole("link", { name: "Feed" })).toHaveClass("bg-sidebar-accent");
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveClass("bg-sidebar-accent");
  });

  it("lays the footer controls out as navigation rows: left-aligned, one line, hint at the right", () => {
    renderSidebar();

    const row = ["flex", "min-h-11", "justify-start", "gap-3", "px-3", "text-sm", "font-medium"];
    const nav = screen.getByRole("link", { name: "Feed" });
    const shortcuts = screen.getByRole("button", { name: "Keyboard shortcuts" });
    const theme = screen.getByTestId("theme-toggle");
    for (const control of [nav, shortcuts, theme]) {
      expect(control).toHaveClass(...row, "whitespace-nowrap");
      expect(control).not.toHaveClass("justify-center");
    }
    expect(theme.className).toBe(shortcuts.className);
    expect(shortcuts.className).toBe(nav.className);
    expect(shortcuts.querySelector("svg")).toHaveClass("size-4", "shrink-0");
    expect(screen.getByText("Shortcuts")).toHaveClass("truncate");
    expect(screen.getByText("?")).toHaveClass("ml-auto", "shrink-0");
    expect(shortcuts).toHaveAttribute("aria-keyshortcuts", "?");
  });

  it("centres the icons in the collapsed rail and keeps the shortcuts name", () => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    const shortcuts = screen.getByRole("button", { name: "Keyboard shortcuts" });
    for (const control of [
      screen.getByRole("link", { name: "Feed" }),
      shortcuts,
      screen.getByTestId("theme-toggle"),
    ]) {
      expect(control).toHaveClass("justify-center", "px-0", "min-h-11");
      expect(control).not.toHaveClass("justify-start");
    }
    expect(shortcuts).not.toHaveTextContent("?");

    // The compact mark is centred in the 64 px rail like the icons, not inset by px-4.
    const logo = screen.getByRole("img", { name: "Distil logo" });
    expect(logo).toHaveAttribute("width", "28");
    expect(logo.querySelectorAll("path")).toHaveLength(1);
    expect(logo.parentElement).toHaveClass("justify-center", "px-0");
    expect(logo.parentElement).not.toHaveClass("px-5");
  });

  it("collapses and expands while keeping an accessible toggle", () => {
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.getByRole("img", { name: "Distil logo" })).toBeInTheDocument();
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-collapsed", "true");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));

    expect(screen.getByRole("img", { name: "Distil logo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });
});
