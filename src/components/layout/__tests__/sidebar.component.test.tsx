/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { Sidebar } from "../sidebar";

const mockUsePathname = jest.fn<string, []>();

jest.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
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

    expect(screen.getByRole("img", { name: "Distil logo" })).toHaveAttribute(
      "data-src",
      "/logo.png"
    );
    expect(screen.getByText("distil")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(6);
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Feed" })).toHaveAttribute("href", "/feed");
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: "Ask" })).toHaveAttribute("href", "/ask");
    expect(screen.getByRole("link", { name: "Save" })).toHaveAttribute("href", "/save");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-collapsed", "false");
  });

  it("keeps legacy and library surfaces out of primary navigation", () => {
    render(<Sidebar />);

    for (const name of ["Digests", "Collections", "Archive", "Topics", "Sources", "Research"]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
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

  it("removes disabled Phase 2 destinations from navigation", () => {
    render(<Sidebar showAnswers={false} showSearch={false} />);

    expect(screen.queryByRole("link", { name: "Ask" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Search" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Feed" })).toHaveAttribute("href", "/feed");
  });

  it("collapses and expands while keeping an accessible toggle", () => {
    render(<Sidebar />);

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.queryByText("distil")).not.toBeInTheDocument();
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-collapsed", "true");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));

    expect(screen.getByText("distil")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });
});
