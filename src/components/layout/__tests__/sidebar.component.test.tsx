/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { Sidebar } from "../sidebar";

const mockUsePathname = jest.fn<string, []>();

jest.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
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
  ThemeToggle: ({ collapsed }: { collapsed?: boolean }) => (
    <span data-testid="theme-toggle" data-collapsed={String(Boolean(collapsed))} />
  ),
}));

describe("Sidebar", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the expanded brand and all navigation destinations", () => {
    render(<Sidebar />);

    expect(screen.getByRole("img", { name: "Distil logo" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Feed" })).toHaveAttribute("href", "/feed");
    expect(screen.getByRole("link", { name: "Research" })).toHaveAttribute("href", "/research");
    expect(screen.getByRole("link", { name: "Save" })).toHaveAttribute("href", "/save");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-collapsed", "false");
  });

  it("keeps legacy and library surfaces out of primary navigation", () => {
    render(<Sidebar />);

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

  it("prefetches primary routes but not rarely used destinations", () => {
    render(<Sidebar />);

    for (const name of ["Today", "Feed"]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("data-prefetch", "default");
    }
    for (const name of ["Research", "Save", "Settings"]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("data-prefetch", "false");
    }
  });

  it("marks only the exact home route active", () => {
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Today" })).toHaveClass("bg-sidebar-accent");
    expect(screen.getByRole("link", { name: "Feed" })).not.toHaveClass("bg-sidebar-accent");
  });

  it("marks nested section routes active", () => {
    mockUsePathname.mockReturnValue("/feed/article-1");

    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "Feed" })).toHaveClass("bg-sidebar-accent");
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveClass("bg-sidebar-accent");
  });

  it("collapses and expands while keeping an accessible toggle", () => {
    render(<Sidebar />);

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
